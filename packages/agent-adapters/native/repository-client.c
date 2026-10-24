/* Fixed-purpose broker client. No Git, shell, filesystem writes or subprocesses. */
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/time.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include "client-config.h"
static int denied(void){fputs("CODOVYN repository metadata denied\n",stderr);return 126;}
int main(int argc,char **argv){
 if(argc<2||argc>9)return denied();int start=1;
 if(argc>=5&&!strcmp(argv[1],"--git-dir")){if(strcmp(argv[2],gitDirectory)||strcmp(argv[3],"--work-tree")||strcmp(argv[4],root))return denied();start=5;}
 char **v=argv+start;int n=argc-start,operation=0;
 if(n==4&&!strcmp(v[0],"rev-parse")&&!strcmp(v[1],"--git-dir")&&!strcmp(v[2],"--git-common-dir")&&!strcmp(v[3],"--show-toplevel"))operation=1;
 if(n==2&&!strcmp(v[0],"rev-parse")&&!strcmp(v[1],"HEAD"))operation=2;
 if(n==4&&!strcmp(v[0],"symbolic-ref")&&!strcmp(v[1],"--quiet")&&!strcmp(v[2],"--short")&&!strcmp(v[3],"HEAD"))operation=3;
 if(n==3&&!strcmp(v[0],"rev-list")&&!strcmp(v[1],"--max-parents=0")&&!strcmp(v[2],"HEAD"))operation=4;
 if(!operation)return denied();char cwd[PATH_MAX];if(!getcwd(cwd,sizeof cwd))return denied();
 int fd=socket(AF_UNIX,SOCK_STREAM,0);if(fd<0)return denied();struct timeval timeout={8,0};setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof timeout);setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof timeout);
 struct sockaddr_un address;memset(&address,0,sizeof address);address.sun_family=AF_UNIX;if(strlen(endpoint)>=sizeof address.sun_path)return denied();strcpy(address.sun_path,endpoint);
 if(connect(fd,(struct sockaddr*)&address,sizeof address))return denied();FILE *stream=fdopen(fd,"r+");if(!stream)return denied();
 fprintf(stream,"1 %s %d ",capability,operation);for(const unsigned char *s=(unsigned char*)cwd;*s;s++)fprintf(stream,"%02x",*s);fputc('\n',stream);if(fflush(stream))return denied();
 char response[65538];if(!fgets(response,sizeof response,stream))return denied();fclose(stream);
 size_t length=strlen(response);if(length<3||length>65536||response[length-1]!='\n')return denied();response[--length]=0;char *space=strchr(response,' ');if(!space)return denied();*space++=0;
 if(strcmp(response,"0")&&strcmp(response,"1")&&strcmp(response,"126"))return denied();size_t size=strlen(space);if(size%2)return denied();
 for(size_t i=0;i<size;i++)if(!strchr("0123456789abcdef",space[i]))return denied();
 if(!strcmp(response,"126"))return denied();
 for(size_t i=0;i<size;i+=2){char pair[3]={space[i],space[i+1],0};unsigned long byte=strtoul(pair,NULL,16);if(!byte)return denied();putchar((int)byte);}return atoi(response);
}
