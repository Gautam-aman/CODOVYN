/* Task-owned create-only draft publication. All data is first staged outside
 * the worktree. Existing targets are never replaced; no shell/Git/network API.
 * Versioned host-only publisher. The host
 * must still enforce task admission, durable write intent and review policy.
 * stdin: START, old/new byte lengths, bounded preimage/new bytes, then COMMIT.
 * fd 3: approved draft root; fd 4: private same-filesystem staging directory. */
#include <sys/stat.h>
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <errno.h>
#define LIMIT 65536
static int fail(void){fputs("Draft file publication rejected\n",stderr);return 76;}
static int same(int a,int b){struct stat x,y;return !fstat(a,&x)&&!fstat(b,&y)&&x.st_nlink>0&&y.st_nlink>0&&x.st_dev==y.st_dev&&x.st_ino==y.st_ino;}
static int component(const char *s){if(!*s||s[0]=='.'||strlen(s)>255||strchr(s,'\\'))return 0;char lower[256];size_t n=strlen(s);for(size_t i=0;i<=n;i++){unsigned char c=s[i];lower[i]=(char)(c>='A'&&c<='Z'?c+32:c);}return !strstr(lower,"credential")&&!strstr(lower,"secret")&&!strstr(lower,"token")&&strcmp(lower,"auth.json")&&strncmp(lower,"id_",3)&&!strstr(lower,".pem")&&!strstr(lower,".key");}
static int boundary(int fd){struct stat a,b;if(!fstatat(fd,".git",&a,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT)return 1;int h=fstatat(fd,"HEAD",&a,AT_SYMLINK_NOFOLLOW),he=errno,o=fstatat(fd,"objects",&b,AT_SYMLINK_NOFOLLOW),oe=errno;return (!h&&!o)||(h&&he!=ENOENT)||(o&&oe!=ENOENT);}
static int walk(int base,const char *path,int nested){int fd=dup(base);struct stat root;char copy[PATH_MAX];if(fd<0||fstat(base,&root)||strlen(path)>=sizeof copy)return -1;strcpy(copy,path);char *save=NULL;for(char *p=strtok_r(copy,"/",&save);p;p=strtok_r(NULL,"/",&save)){if(!*p||!strcmp(p,".")||!strcmp(p,"..")||(nested&&!component(p))){close(fd);return -1;}int next=openat(fd,p,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);if(next<0)return -1;fd=next;if(nested){struct stat info;if(fstat(fd,&info)||info.st_dev!=root.st_dev||boundary(fd)){close(fd);return -1;}}}return fd;}
static int matches(const char *path,int fd){if(path[0]!='/'||strstr(path,"//"))return 0;int slash=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(slash<0)return 0;int actual=walk(slash,path+1,0);close(slash);if(actual<0)return 0;int equal=same(actual,fd);close(actual);return equal;}

static int identity(int fd,char *out,size_t size){struct stat s;if(fstat(fd,&s)||!S_ISREG(s.st_mode)||s.st_nlink!=1||s.st_size<0||s.st_size>LIMIT||(s.st_mode&07000))return 0;int n=snprintf(out,size,"%llu:%llu:%lld:%lld:%ld:%lld:%ld:%u",(unsigned long long)s.st_dev,(unsigned long long)s.st_ino,(long long)s.st_size,(long long)s.st_mtimespec.tv_sec,s.st_mtimespec.tv_nsec,(long long)s.st_ctimespec.tv_sec,s.st_ctimespec.tv_nsec,(unsigned int)s.st_mode);return n>0&&(size_t)n<size;}
static int equal_bytes(int fd,const unsigned char *data,size_t size){unsigned char actual[LIMIT+1];if(lseek(fd,0,SEEK_SET)<0)return 0;size_t total=0;while(total<=LIMIT){ssize_t n=read(fd,actual+total,LIMIT+1-total);if(n<0)return 0;if(!n)break;total+=(size_t)n;}return total==size&&!memcmp(actual,data,size);}
static int length_line(unsigned long *n){char line[16],*end;if(!fgets(line,sizeof line,stdin))return 0;errno=0;*n=strtoul(line,&end,10);return !errno&&*n<=LIMIT&&end!=line&&!strcmp(end,"\n");}
int main(int argc,char **argv){
 if(argc==2&&!strcmp(argv[1],"--lock")){struct stat s;if(fstat(3,&s)||!S_ISREG(s.st_mode)||s.st_nlink!=1||s.st_uid!=getuid())return 76;return flock(3,LOCK_EX|LOCK_NB)?75:0;}
 if(argc!=7||!matches(argv[1],3)||!matches(argv[2],4)||strlen(argv[3])>=PATH_MAX||!component(argv[4]))return fail();
 int lease=openat(4,"lease",O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);struct stat lock;if(lease<0||!same(lease,5)||fstat(5,&lock)||!S_ISREG(lock.st_mode)||lock.st_uid!=getuid()||lock.st_nlink!=1||flock(5,LOCK_EX|LOCK_NB))return fail();close(lease);
 int replace=!strcmp(argv[5],"replace");if(!replace&&strcmp(argv[5],"create"))return fail();
 const char *path=argv[3],*staging=argv[4];if(!*path||path[0]=='/'||path[strlen(path)-1]=='/'||strstr(path,"//"))return fail();
 /* No mutation before the host has durably recorded this process identity. */
 char start[16];if(!fgets(start,sizeof start,stdin)||strcmp(start,"START\n")||getppid()<=1)return fail();pid_t owner=getppid();
 char copy[PATH_MAX];strcpy(copy,path);char *slash=strrchr(copy,'/');const char *name=slash?slash+1:copy;if(!component(name))return fail();int parent;if(slash){*slash=0;parent=walk(3,copy,1);}else parent=dup(3);if(parent<0)return fail();
 unsigned long oldSize,newSize;if(!length_line(&oldSize)||!length_line(&newSize))return fail();unsigned char old[LIMIT],data[LIMIT];if(fread(old,1,oldSize,stdin)!=oldSize||fread(data,1,newSize,stdin)!=newSize)return fail();
 int original=-1;char before[256],now[256];struct stat previous,entry,root,stage;
 if(fstat(3,&root)||fstat(4,&stage)||root.st_dev!=stage.st_dev)return fail();
 if(replace){original=openat(parent,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);if(original<0||!identity(original,before,sizeof before)||strcmp(before,argv[6])||!equal_bytes(original,old,oldSize)||fstat(original,&previous)||previous.st_dev!=root.st_dev)return 75;}
 else if(oldSize||strcmp(argv[6],"-")||!fstatat(parent,name,&entry,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT)return fail();
 int file=openat(4,staging,O_RDWR|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);if(file<0)return fail();size_t total=0;while(total<newSize){ssize_t n=write(file,data+total,newSize-total);if(n<=0)return fail();total+=(size_t)n;}
 if(replace&&fchmod(file,previous.st_mode&0777))return fail();if(fsync(file)||fsync(4))return fail();puts("READY");fflush(stdout);
 char commit[16];if(!fgets(commit,sizeof commit,stdin)||strcmp(commit,"COMMIT\n")||getppid()!=owner||!matches(argv[1],3)||!matches(argv[2],4))return fail();
 int current=slash?walk(3,copy,1):dup(3);if(current<0||!same(current,parent))return fail();close(current);
 if(replace&&(!identity(original,now,sizeof now)||strcmp(before,now)||!equal_bytes(original,old,oldSize)||fstatat(parent,name,&entry,AT_SYMLINK_NOFOLLOW)||entry.st_dev!=previous.st_dev||entry.st_ino!=previous.st_ino))return 75;
#ifdef CODOVYN_TASK_PUBLISH_TEST_PAUSE
 puts("PINNED_BEFORE_RENAME");fflush(stdout);if(getchar()!='\n')return fail();
#endif
 if(renameatx_np(4,staging,parent,name,replace?RENAME_SWAP:RENAME_EXCL))return fail();
 /* Once rename succeeds, every failure is ambiguous/conflicting. Never roll
  * back over a concurrent writer. The displaced preimage stays host-private. */
 if(fsync(parent)||fsync(4))return 77;
 if(replace){int captured=openat(4,staging,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);struct stat s;if(captured<0||fstat(captured,&s)||s.st_dev!=previous.st_dev||s.st_ino!=previous.st_ino||s.st_nlink!=1||!S_ISREG(s.st_mode)||s.st_mode!=previous.st_mode||s.st_mtimespec.tv_sec!=previous.st_mtimespec.tv_sec||s.st_mtimespec.tv_nsec!=previous.st_mtimespec.tv_nsec||!equal_bytes(captured,old,oldSize))return 78;close(captured);}
 current=slash?walk(3,copy,1):dup(3);int target=openat(parent,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);if(current<0||!same(current,parent)||!matches(argv[1],3)||!matches(argv[2],4)||getppid()!=owner||target<0||!same(file,target)||!equal_bytes(target,data,newSize))return 77;
 puts("PUBLISHED");close(target);close(current);close(file);if(original>=0)close(original);close(parent);return 0;
}
