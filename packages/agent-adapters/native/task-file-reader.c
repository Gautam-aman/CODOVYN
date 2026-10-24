/* Read-only task file leaf. fd 3 is an inherited host-pinned workspace root.
 * No Git, writes, executable spawning or network operations. */
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <limits.h>
#include <errno.h>
#define LIMIT 65536
static int fail(void){fputs("Task file access rejected\n",stderr);return 76;}
static int component(const char *s){
 if(!*s||s[0]=='.'||strlen(s)>255||strchr(s,'\\'))return 0;
 char lower[256];size_t n=strlen(s);for(size_t i=0;i<=n;i++){unsigned char c=s[i];lower[i]=(char)(c>='A'&&c<='Z'?c+32:c);}
 return !strstr(lower,"credential")&&!strstr(lower,"secret")&&!strstr(lower,"token")&&strcmp(lower,"auth.json")&&strncmp(lower,"id_",3)&&!strstr(lower,".pem")&&!strstr(lower,".key");
}
static int same(int a,int b){struct stat x,y;return !fstat(a,&x)&&!fstat(b,&y)&&x.st_dev==y.st_dev&&x.st_ino==y.st_ino&&x.st_nlink>0&&y.st_nlink>0;}
static int directory(int start,const char *path){int fd=dup(start);char copy[PATH_MAX];if(fd<0||strlen(path)>=sizeof copy)return -1;strcpy(copy,path);char *save=NULL;
 for(char *s=strtok_r(copy,"/",&save);s;s=strtok_r(NULL,"/",&save)){if(!strcmp(s,".")||!strcmp(s,"..")){close(fd);return -1;}int next=openat(fd,s,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);if(next<0)return -1;fd=next;}return fd;}
static int root_matches(const char *path){if(path[0]!='/'||strstr(path,"//"))return 0;int slash=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(slash<0)return 0;int current=directory(slash,path+1);close(slash);if(current<0)return 0;int ok=same(3,current);close(current);return ok;}
int main(int argc,char **argv){
 if(argc!=3||strlen(argv[1])>=PATH_MAX||strlen(argv[2])>=PATH_MAX||!root_matches(argv[1]))return fail();
 const char *path=argv[2];if(!*path||path[0]=='/'||path[strlen(path)-1]=='/'||strstr(path,"//"))return fail();
 pid_t owner=getppid();char copy[PATH_MAX];strcpy(copy,path);int parent=dup(3);char *save=NULL,*name=strtok_r(copy,"/",&save);if(parent<0||!name)return fail();
 for(;;){if(!component(name))return fail();char *next=strtok_r(NULL,"/",&save);if(!next)break;
  int fd=openat(parent,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(parent);if(fd<0)return fail();parent=fd;struct stat marker;if(!fstatat(parent,".git",&marker,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT)return fail();name=next;
 }
 int file=openat(parent,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);if(file<0)return fail();struct stat before,after,entry;
 if(fstat(file,&before)||!S_ISREG(before.st_mode)||before.st_nlink!=1||before.st_size<0||before.st_size>LIMIT)return fail();
#ifdef CODOVYN_TASK_FILE_TEST_PAUSE
 puts("PINNED");fflush(stdout);if(getchar()!='\n')return fail();
#endif
 unsigned char content[LIMIT+1];ssize_t total=0;while(total<=LIMIT){ssize_t n=read(file,content+total,(size_t)(LIMIT+1-total));if(n<0)return fail();if(!n)break;total+=n;}
 if(fstat(file,&after)||fstatat(parent,name,&entry,AT_SYMLINK_NOFOLLOW)||!S_ISREG(entry.st_mode)||entry.st_dev!=before.st_dev||entry.st_ino!=before.st_ino||after.st_nlink!=1||total!=before.st_size||total>LIMIT||before.st_size!=after.st_size||before.st_mtimespec.tv_sec!=after.st_mtimespec.tv_sec||before.st_mtimespec.tv_nsec!=after.st_mtimespec.tv_nsec||before.st_ctimespec.tv_sec!=after.st_ctimespec.tv_sec||before.st_ctimespec.tv_nsec!=after.st_ctimespec.tv_nsec||getppid()!=owner||!root_matches(argv[1]))return fail();
 // Reopen the complete parent chain: moving a pinned subdirectory out of the
 // authorized root must not turn its descriptor into external file authority.
 char parentPath[PATH_MAX];strcpy(parentPath,path);char *slash=strrchr(parentPath,'/');int current;
 if(slash){*slash=0;current=directory(3,parentPath);}else current=dup(3);
 if(current<0||!same(current,parent))return fail();close(current);
 for(ssize_t i=0;i<total;i++)printf("%02x",content[i]);putchar('\n');close(file);close(parent);return 0;
}
