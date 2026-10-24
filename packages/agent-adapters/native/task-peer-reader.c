/* Host-only inspection of a task-owned loopback MCP socket. No commands,
 * credential files, process memory, source files or network operations. */
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <errno.h>
static int number(const char *s,unsigned long long max,unsigned long long *out){if(!*s||strlen(s)>20)return 0;for(const char *p=s;*p;p++)if(*p<'0'||*p>'9')return 0;errno=0;char *end;*out=strtoull(s,&end,10);return !errno&&!*end&&*out<=max;}
static int identity(int pid,int parent,const char *exe,const char *seconds,const char *micros,struct proc_bsdinfo *out){
 char actual[PROC_PIDPATHINFO_MAXSIZE];if(proc_pidinfo(pid,PROC_PIDTBSDINFO,0,out,sizeof *out)!=(int)sizeof *out||out->pbi_uid!=getuid()||out->pbi_pid!=(unsigned)pid||out->pbi_ppid!=(unsigned)parent||proc_pidpath(pid,actual,sizeof actual)<=0||strcmp(actual,exe))return 0;
 if(!strcmp(seconds,"-")&&!strcmp(micros,"-"))return 1;unsigned long long s,u;if(!number(seconds,ULLONG_MAX,&s)||!number(micros,999999,&u))return 0;return out->pbi_start_tvsec==s&&out->pbi_start_tvusec==u;
}
static int socket_matches(struct socket_fdinfo *s,int local,int remote){
 if(s->psi.soi_family!=AF_INET||s->psi.soi_kind!=SOCKINFO_TCP||s->psi.soi_proto.pri_tcp.tcpsi_state!=TSI_S_ESTABLISHED)return 0;
 struct in_sockinfo *in=&s->psi.soi_proto.pri_tcp.tcpsi_ini;return ntohs((unsigned short)in->insi_lport)==local&&ntohs((unsigned short)in->insi_fport)==remote&&in->insi_laddr.ina_46.i46a_addr4.s_addr==htonl(INADDR_LOOPBACK)&&in->insi_faddr.ina_46.i46a_addr4.s_addr==htonl(INADDR_LOOPBACK);
}
int main(int argc,char **argv){
 if(argc!=9||strlen(argv[4])>=PROC_PIDPATHINFO_MAXSIZE)return 76;unsigned long long pid,parent,local,remote;
 if(!number(argv[2],INT_MAX,&pid)||!pid||!number(argv[3],INT_MAX,&parent)||!parent||!number(argv[7],65535,&local)||!number(argv[8],65535,&remote))return 76;
 struct proc_bsdinfo before,after;if(!identity((int)pid,(int)parent,argv[4],argv[5],argv[6],&before))return 77;
 if(!strcmp(argv[1],"identity")&&!local&&!remote){printf("{\"seconds\":\"%llu\",\"micros\":\"%llu\"}\n",(unsigned long long)before.pbi_start_tvsec,(unsigned long long)before.pbi_start_tvusec);return 0;}
 if(strcmp(argv[1],"socket")||!local||!remote||!strcmp(argv[5],"-"))return 76;
 struct proc_fdinfo fds[4096];int bytes=proc_pidinfo((int)pid,PROC_PIDLISTFDS,0,fds,sizeof fds);if(bytes<=0||bytes>=(int)sizeof fds||bytes%(int)sizeof(fds[0]))return 76;
 for(int i=0;i<bytes/(int)sizeof(fds[0]);i++){
  if(fds[i].proc_fdtype!=PROX_FDTYPE_SOCKET)continue;struct socket_fdinfo first,last;
  if(proc_pidfdinfo((int)pid,fds[i].proc_fd,PROC_PIDFDSOCKETINFO,&first,sizeof first)!=(int)sizeof first||!socket_matches(&first,(int)local,(int)remote))continue;
  if(!identity((int)pid,(int)parent,argv[4],argv[5],argv[6],&after))return 77;
  if(proc_pidfdinfo((int)pid,fds[i].proc_fd,PROC_PIDFDSOCKETINFO,&last,sizeof last)!=(int)sizeof last||!socket_matches(&last,(int)local,(int)remote)||first.psi.soi_proto.pri_tcp.tcpsi_ini.insi_gencnt!=last.psi.soi_proto.pri_tcp.tcpsi_ini.insi_gencnt)return 76;
  printf("{\"generation\":\"%llx\"}\n",(unsigned long long)last.psi.soi_proto.pri_tcp.tcpsi_ini.insi_gencnt);return 0;
 }
 return 76;
}
