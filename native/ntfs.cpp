#define NOMINMAX
#include <windows.h>
#include <winioctl.h>
#include <iostream>
#include <algorithm>
#include <cstdio>
#include <string>
#include <vector>
#include <limits>
#include <cstring>
#include <stdexcept>

struct Handle {
 HANDLE value;
 explicit Handle(HANDLE h):value(h){}
 ~Handle(){if(value!=INVALID_HANDLE_VALUE)CloseHandle(value);}
 Handle(const Handle&)=delete;
};
static std::string utf8(const std::wstring& s){
 int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),nullptr,0,nullptr,nullptr);
 if(!n&&!s.empty())throw std::runtime_error("Invalid UTF-16 metadata");
 std::string out(n,'\0');WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),out.data(),n,nullptr,nullptr);return out;
}
static std::string quote(const std::wstring& value){
 std::string out="\"";for(unsigned char c:utf8(value)){if(c=='"'||c=='\\'){out+='\\';out+=c;}else if(c<32){char b[7];sprintf_s(b,"\\u%04x",c);out+=b;}else out+=c;}return out+'"';
}
static USN_RECORD_V2 record(const BYTE* p,DWORD remaining){
 if(remaining<60)throw std::runtime_error("Truncated USN record");
 USN_RECORD_V2 r{};memcpy(&r,p,(std::min)(sizeof(r),static_cast<size_t>(remaining)));
 if(r.MajorVersion!=2||r.RecordLength<60||r.RecordLength>remaining||r.RecordLength%8||r.FileNameOffset<60||r.FileNameLength%2||!r.FileNameLength||static_cast<DWORD>(r.FileNameOffset)+r.FileNameLength>r.RecordLength)throw std::runtime_error("Unsupported or malformed USN record");
 return r;
}
static void check(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
static void selftest(){
 BYTE buffer[72]{};USN_RECORD_V2 r{};r.RecordLength=72;r.MajorVersion=2;r.FileNameOffset=60;r.FileNameLength=2;memcpy(buffer,&r,sizeof(r));record(buffer,72);
 for(int i=0;i<4;i++){auto bad=r;if(i==0)bad.MajorVersion=3;if(i==1)bad.RecordLength=80;if(i==2)bad.FileNameOffset=72;if(i==3)bad.FileNameLength=3;memcpy(buffer,&bad,sizeof(bad));bool rejected=false;try{record(buffer,72);}catch(...){rejected=true;}check(rejected,"Parser accepted bad record");}
 std::cout<<"native record validation passed\n";
}
int wmain(int argc,wchar_t** argv){
 try{
  if(argc==2&&std::wstring(argv[1])==L"--self-test"){selftest();return 0;}
  check(argc==2,"Expected one drive root");std::wstring root=argv[1];
  check(root.size()==3&&root[1]==L':'&&root[2]==L'\\',"Whole drive required");
  check(GetDriveTypeW(root.c_str())==DRIVE_FIXED,"Local fixed volume required");
  WCHAR fs[64]{},guid[128]{};DWORD serial=0;
  check(GetVolumeInformationW(root.c_str(),nullptr,0,&serial,nullptr,nullptr,fs,64)!=0,"Volume probe failed");
  check(std::wstring(fs)==L"NTFS","NTFS required");
  check(GetVolumeNameForVolumeMountPointW(root.c_str(),guid,128)!=0,"Volume identity unavailable");
  std::wstring device=L"\\\\.\\"+root.substr(0,2);
  Handle volume(CreateFileW(device.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr));
  check(volume.value!=INVALID_HANDLE_VALUE,"Read-only MFT access unavailable");
  USN_JOURNAL_DATA_V0 initial{};DWORD returned=0;
  check(DeviceIoControl(volume.value,FSCTL_QUERY_USN_JOURNAL,nullptr,0,&initial,sizeof(initial),&returned,nullptr)!=0,"USN journal unavailable");
  std::cout<<"{\"type\":\"header\",\"version\":1,\"volumeGuid\":"<<quote(guid)<<",\"journalId\":\""<<initial.UsnJournalID<<"\"}\n";
  MFT_ENUM_DATA_V0 cursor{};cursor.LowUsn=0;cursor.HighUsn=(std::numeric_limits<LONGLONG>::max)();
  std::vector<BYTE> buffer(256*1024);unsigned long long entries=0,skipped=0;
  for(;;){
   if(!DeviceIoControl(volume.value,FSCTL_ENUM_USN_DATA,&cursor,sizeof(cursor),buffer.data(),static_cast<DWORD>(buffer.size()),&returned,nullptr)){
    check(GetLastError()==ERROR_HANDLE_EOF,"MFT enumeration failed");break;
   }
   check(returned>=sizeof(DWORDLONG),"Truncated enumeration response");DWORDLONG next=0;memcpy(&next,buffer.data(),sizeof(next));check(next>cursor.StartFileReferenceNumber,"MFT cursor did not advance");
   DWORD offset=sizeof(DWORDLONG);
   while(offset<returned){
    auto r=record(buffer.data()+offset,returned-offset);offset+=r.RecordLength;
    // Reserved MFT metadata records are not ordinary directory entries.
    if((r.FileReferenceNumber&0x0000ffffffffffffULL)<16)continue;
    if(r.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT){skipped++;continue;}
    FILE_ID_DESCRIPTOR identity{};identity.dwSize=sizeof(identity);identity.Type=FileIdType;identity.FileId.QuadPart=r.FileReferenceNumber;
    Handle file(OpenFileById(volume.value,&identity,FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT|FILE_FLAG_OPEN_NO_RECALL));
    if(file.value==INVALID_HANDLE_VALUE){skipped++;continue;}
    FILE_STANDARD_INFO standard{};FILE_BASIC_INFO basic{};
    if(!GetFileInformationByHandleEx(file.value,FileStandardInfo,&standard,sizeof(standard))||!GetFileInformationByHandleEx(file.value,FileBasicInfo,&basic,sizeof(basic))){skipped++;continue;}
    if(basic.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT){skipped++;continue;}
    check(standard.Directory||standard.NumberOfLinks<=1,"Hard-link paths require traversal fallback");
    DWORD length=GetFinalPathNameByHandleW(file.value,nullptr,0,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);
    if(!length||length>32768){skipped++;continue;}std::vector<WCHAR> name(length+1);
    DWORD written=GetFinalPathNameByHandleW(file.value,name.data(),static_cast<DWORD>(name.size()),FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);
    if(!written||written>=name.size()){skipped++;continue;}
    std::wstring full(name.data(),written);if(full.rfind(L"\\\\?\\",0)==0)full=full.substr(4);
    check(full.size()>=3&&_wcsnicmp(full.c_str(),root.c_str(),3)==0,"Unexpected volume path");
    if(full==root)continue;
    // Internal metadata paths are not part of normal filesystem traversal.
    if(full.rfind(root+L"$Extend",0)==0)continue;
    check(standard.EndOfFile.QuadPart>=0&&standard.EndOfFile.QuadPart<=9007199254740991LL,"File size exceeds safe precision");
    auto ms=(basic.LastWriteTime.QuadPart-116444736000000000LL)/10000;
    std::cout<<"{\"type\":\"entry\",\"path\":"<<quote(full)<<",\"directory\":"<<(standard.Directory?"true":"false")<<",\"size\":"<<(standard.Directory?0:standard.EndOfFile.QuadPart)<<",\"modified\":"<<ms<<"}\n";entries++;
    check(std::cout.good(),"Output pipe closed");
   }
   cursor.StartFileReferenceNumber=next;
  }
  USN_JOURNAL_DATA_V0 finalState{};
  check(DeviceIoControl(volume.value,FSCTL_QUERY_USN_JOURNAL,nullptr,0,&finalState,sizeof(finalState),&returned,nullptr)!=0,"Journal validation failed");
  check(initial.UsnJournalID==finalState.UsnJournalID&&initial.NextUsn==finalState.NextUsn,"Volume changed during baseline; traversal required");
  std::cout<<"{\"type\":\"done\",\"entries\":"<<entries<<",\"skipped\":"<<skipped<<",\"nextUsn\":\""<<finalState.NextUsn<<"\"}\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 2;}
}
