/* TEST ONLY: install the candidate profile after dyld startup to distinguish
 * actual policy decisions from a provider that cannot start. Never a launcher. */
#include <sandbox.h>
#include <spawn.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
extern char **environ;
int main(int argc,char **argv){
 if(argc!=9)return 2;char *error=NULL;if(sandbox_init(argv[1],0,&error)){sandbox_free_error(error);return 3;}
 int reads=0,writes=0,execs=0,links=0,symlinks=0;
 for(int i=2;i<5;i++){int fd=open(argv[i],O_RDONLY);if(fd<0&&(errno==EPERM||errno==EACCES))reads++;else if(fd>=0)close(fd);}
 for(int i=5;i<8;i++){int fd=open(argv[i],O_WRONLY|O_CREAT|O_TRUNC,0600);if(fd<0&&(errno==EPERM||errno==EACCES))writes++;else if(fd>=0)close(fd);}
 char alias[4096];if(snprintf(alias,sizeof(alias),"%s/hardlink",getenv("TMPDIR"))>=(int)sizeof(alias))return 7;
 if(link(argv[3],alias)<0&&(errno==EPERM||errno==EACCES))links++;
 if(snprintf(alias,sizeof(alias),"%s/symlink",getenv("TMPDIR"))>=(int)sizeof(alias))return 8;
 if(symlink(argv[3],alias)<0){if(errno==EPERM||errno==EACCES)symlinks++;}else{int fd=open(alias,O_RDONLY);if(fd<0&&(errno==EPERM||errno==EACCES))symlinks++;else if(fd>=0)close(fd);}
 const char *commands[]={"/bin/sh","/usr/bin/git","/usr/bin/curl",argv[8]};
 for(int i=0;i<4;i++){pid_t pid;char *args[]={(char*)commands[i],"--version",NULL};int code=posix_spawn(&pid,commands[i],NULL,NULL,args,environ);if(code==EPERM||code==EACCES)execs++;else if(code==0){int status;waitpid(pid,&status,0);}}
 char state[4096];if(snprintf(state,sizeof(state),"%s/allowed.txt",getenv("TMPDIR"))>=(int)sizeof(state))return 4;int fd=open(state,O_CREAT|O_WRONLY|O_TRUNC,0600);if(fd<0||write(fd,"state only",10)!=10)return 5;close(fd);fd=open(state,O_RDONLY);char bytes[11]={0};if(fd<0||read(fd,bytes,10)!=10)return 6;close(fd);
 printf("{\"reads\":%d,\"writes\":%d,\"execs\":%d,\"state\":\"%s\",\"hardlinkDenied\":%d,\"symlinkReadDenied\":%d}\n",reads,writes,execs,bytes,links,symlinks);return 0;
}
