/* Task-owned create-only draft publication. All data is first staged outside
 * the worktree. Existing targets are never replaced; no shell/Git/network API.
 * Experimental host-only primitive, not exposed to providers or MCP. The host
 * must still enforce task admission, durable write intent and review policy.
 * stdin: decimal byte length + newline, exact bytes, then COMMIT newline.
 * fd 3: approved draft root; fd 4: private same-filesystem staging directory. */
#include <sys/stat.h>
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
int main(int argc,char **argv){
 if(argc!=5||!matches(argv[1],3)||!matches(argv[2],4)||strlen(argv[3])>=PATH_MAX||!component(argv[4]))return fail();
 const char *path=argv[3],*staging=argv[4];if(!*path||path[0]=='/'||path[strlen(path)-1]=='/'||strstr(path,"//"))return fail();char copy[PATH_MAX];strcpy(copy,path);char *slash=strrchr(copy,'/');const char *name=slash?slash+1:copy;if(!component(name))return fail();int parent;
 if(slash){*slash=0;parent=walk(3,copy,1);}else parent=dup(3);if(parent<0)return fail();struct stat existing;if(!fstatat(parent,name,&existing,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT)return fail();
 char header[16];if(!fgets(header,sizeof header,stdin))return fail();char *end;errno=0;unsigned long size=strtoul(header,&end,10);if(errno||size>LIMIT||end==header||strcmp(end,"\n"))return fail();unsigned char data[LIMIT];if(fread(data,1,size,stdin)!=size)return fail();
 struct stat a,b;if(fstat(3,&a)||fstat(4,&b)||a.st_dev!=b.st_dev)return fail();pid_t owner=getppid();
 int file=openat(4,staging,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);if(file<0)return fail();size_t total=0;while(total<size){ssize_t n=write(file,data+total,size-total);if(n<=0)return fail();total+=(size_t)n;}if(fsync(file)||close(file))return fail();puts("READY");fflush(stdout);
 char commit[16];if(!fgets(commit,sizeof commit,stdin)||strcmp(commit,"COMMIT\n")||getppid()!=owner||!matches(argv[1],3)||!matches(argv[2],4))return fail();
 int current=slash?walk(3,copy,1):dup(3);if(current<0||!same(current,parent))return fail();close(current);
#ifdef CODOVYN_TASK_CREATE_TEST_PAUSE
 puts("PINNED_BEFORE_RENAME");fflush(stdout);if(getchar()!='\n')return fail();
#endif
 if(renameatx_np(4,staging,parent,name,RENAME_EXCL))return fail();if(fsync(parent))return 77;
 // A changed identity after publication is ambiguous; never report success.
 current=slash?walk(3,copy,1):dup(3);if(current<0||!same(current,parent)||!matches(argv[1],3)||!matches(argv[2],4)||getppid()!=owner)return 77;close(current);
 puts("PUBLISHED");close(parent);return 0;
}
