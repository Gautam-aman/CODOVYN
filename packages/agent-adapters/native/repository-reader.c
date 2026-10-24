/* Host-only bounded Git metadata reader. No exec, configuration or network API.
 * All traversal is relative to verified directory descriptors, without symlinks. */
#include <sys/stat.h>
#include <sys/mount.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <limits.h>
#define BOUND 131072
static int fail(void){fputs("Repository identity or metadata rejected\n",stderr);return 76;}
static int segment(const char *s){if(!*s||!strcmp(s,".")||!strcmp(s,"..")||strlen(s)>255)return 0;return 1;}
static int walk(int base,const char *path){
 int fd=dup(base);if(fd<0)return -1;char copy[PATH_MAX];if(strlen(path)>=sizeof copy){close(fd);return -1;}strcpy(copy,path);
 char *save=NULL;for(char *p=strtok_r(copy,"/",&save);p;p=strtok_r(NULL,"/",&save)){if(!segment(p)){close(fd);return -1;}int next=openat(fd,p,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);if(next<0)return -1;fd=next;}return fd;
}
static int absolute(const char *path){if(path[0]!='/'||strstr(path,"//"))return -1;int slash=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(slash<0)return -1;int fd=walk(slash,path+1);close(slash);return fd;}
/* Lexical normalization only: never resolve provider-controlled pointers. */
static int normalized(const char *input,char *out){
 if(input[0]!='/'||strlen(input)>=PATH_MAX)return 0;char copy[PATH_MAX];strcpy(copy,input);char *parts[PATH_MAX/2],*save=NULL;int count=0;
 for(char *p=strtok_r(copy,"/",&save);p;p=strtok_r(NULL,"/",&save)){if(!strcmp(p,"."))continue;if(!strcmp(p,"..")){if(!count)return 0;count--;continue;}if(!segment(p)||count>=PATH_MAX/2)return 0;parts[count++]=p;}
 size_t used=0;out[used++]='/';for(int i=0;i<count;i++){size_t n=strlen(parts[i]);if(used+n+1>=PATH_MAX)return 0;memcpy(out+used,parts[i],n);used+=n;if(i<count-1)out[used++]='/';}out[used]=0;return 1;
}
static int same(int a,int b){struct stat x,y;return !fstat(a,&x)&&!fstat(b,&y)&&x.st_dev==y.st_dev&&x.st_ino==y.st_ino&&x.st_nlink>0&&y.st_nlink>0;}
static void identity(int fd,char *out,size_t size){struct stat s;if(fstat(fd,&s)||!s.st_nlink){*out=0;return;}snprintf(out,size,"%llu:%llu",(unsigned long long)s.st_dev,(unsigned long long)s.st_ino);}
/* Returns 0 for an explicitly allowed absent ref, -1 for errors, otherwise bytes. */
static long read_at(int dir,const char *path,unsigned char *out,int optional){
 char copy[PATH_MAX];if(strlen(path)>=sizeof copy)return -1;strcpy(copy,path);char *slash=strrchr(copy,'/');int parent=dup(dir);const char *name=copy;
 if(slash){*slash=0;close(parent);parent=walk(dir,copy);name=slash+1;}if(parent<0)return optional&&errno==ENOENT?0:-1;
 if(!segment(name)){close(parent);return -1;}int fd=openat(parent,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);int e=errno;close(parent);if(fd<0)return optional&&e==ENOENT?0:-1;
 struct stat before,after;if(fstat(fd,&before)||!S_ISREG(before.st_mode)||before.st_size<1||before.st_size>BOUND){close(fd);return -1;}
 long total=0;while(total<=BOUND){ssize_t count=read(fd,out+total,(size_t)(BOUND+1-total));if(count<0){close(fd);return -1;}if(!count)break;total+=count;}
 if(fstat(fd,&after)||before.st_dev!=after.st_dev||before.st_ino!=after.st_ino||before.st_size!=after.st_size||before.st_mtimespec.tv_sec!=after.st_mtimespec.tv_sec||before.st_mtimespec.tv_nsec!=after.st_mtimespec.tv_nsec||before.st_ctimespec.tv_sec!=after.st_ctimespec.tv_sec||before.st_ctimespec.tv_nsec!=after.st_ctimespec.tv_nsec||total!=before.st_size||total>BOUND){close(fd);return -1;}
 close(fd);out[total]=0;return total;
}
static void trim(unsigned char *b,long *n){while(*n>0&&(b[*n-1]=='\n'||b[*n-1]=='\r'))b[--*n]=0;}
static void hex(const char *name,const unsigned char *b,long n){printf("\"%s\":\"",name);for(long i=0;i<n;i++)printf("%02x",b[i]);putchar('"');}
static int nested(int root,const char *relative){
 int fd=dup(root);char copy[PATH_MAX];if(fd<0||strlen(relative)>=sizeof copy){if(fd>=0)close(fd);return -1;}strcpy(copy,relative);char *save=NULL;
 for(char *p=strtok_r(copy,"/",&save);p;p=strtok_r(NULL,"/",&save)){if(!segment(p)){close(fd);return -1;}int next=openat(fd,p,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);if(next<0)return -1;fd=next;struct stat s;if(!fstatat(fd,".git",&s,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT){close(fd);return -1;}}
 return fd;
}
static int valid_ref(const char *p){
 if(strncmp(p,"refs/heads/",11)||strlen(p)>1024||strstr(p,"..")||strstr(p,"//")||strstr(p,"@{")||strstr(p,".lock")||p[strlen(p)-1]=='/')return 0;
 for(const char *s=p;*s;s++)if(!((*s>='a'&&*s<='z')||(*s>='A'&&*s<='Z')||(*s>='0'&&*s<='9')||strchr("/_-.",*s)))return 0;return 1;
}
int main(int argc,char **argv){
 /* root, approved git dir, approved common dir, relative cwd, expected stable IDs
  * ('-' only during host authorization), state|object, optional object ID */
 if(argc!=8)return fail();for(int i=1;i<argc;i++)if(strlen(argv[i])>=PATH_MAX)return fail();
 const char *root=argv[1],*gd=argv[2],*common=argv[3],*cwd=argv[4],*expected=argv[5],*op=argv[6],*oid=argv[7];
 if(strcmp(op,"state")&&strcmp(op,"object"))return fail();if(cwd[0]=='/'||strstr(cwd,"//"))return fail();
 int r=absolute(root),g=absolute(gd),c=absolute(common);if(r<0||g<0||c<0)return fail();
 struct statfs local;if(fstatfs(r,&local)||!(local.f_flags&MNT_LOCAL)||fstatfs(g,&local)||!(local.f_flags&MNT_LOCAL)||fstatfs(c,&local)||!(local.f_flags&MNT_LOCAL))return fail();
 pid_t parent=getppid();
 struct stat marker;if(fstatat(r,".git",&marker,AT_SYMLINK_NOFOLLOW)||S_ISLNK(marker.st_mode))return fail();
 unsigned char data[BOUND+2],head[BOUND+2],ref[BOUND+2],packed[BOUND+2],end[BOUND+2];long n=0;
 if(S_ISDIR(marker.st_mode)) {int actual=openat(r,".git",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(actual<0||!same(actual,g)||!same(g,c))return fail();close(actual);}
 else if(S_ISREG(marker.st_mode)) {
  n=read_at(r,".git",data,0);if(n<1)return fail();trim(data,&n);if(memchr(data,0,(size_t)n))return fail();char pointer[PATH_MAX];if(snprintf(pointer,sizeof pointer,"gitdir: %s",gd)>=(int)sizeof pointer||strcmp((char*)data,pointer))return fail();
  if(strcmp(gd,common)){
   char back[PATH_MAX],resolved[PATH_MAX];n=read_at(g,"gitdir",data,0);if(n<1)return fail();trim(data,&n);if(memchr(data,0,(size_t)n))return fail();if(snprintf(back,sizeof back,"%s/.git",root)>=(int)sizeof back||strcmp((char*)data,back))return fail();
   n=read_at(g,"commondir",data,0);if(n<1)return fail();trim(data,&n);if(memchr(data,0,(size_t)n))return fail();char path[PATH_MAX];if(data[0]=='/'){if(strlen((char*)data)>=sizeof path)return fail();strcpy(path,(char*)data);}else if(snprintf(path,sizeof path,"%s/%s",gd,data)>=(int)sizeof path)return fail();if(!normalized(path,resolved)||strcmp(resolved,common))return fail();
  }
 }else return fail();
#ifdef CODOVYN_READER_TEST_PAUSE
 /* Only adversarial-test builds contain this deterministic race barrier. */
 fputs("PINNED\n",stdout);fflush(stdout);char barrier;if(read(STDIN_FILENO,&barrier,1)!=1)return fail();
#endif
 if(!strcmp(gd,common)){struct stat unexpected;if(!fstatat(g,"commondir",&unexpected,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT)return fail();}
 char ri[80],gi[80],ci[80],mi[80],ids[400];identity(r,ri,sizeof ri);identity(g,gi,sizeof gi);identity(c,ci,sizeof ci);snprintf(mi,sizeof mi,"%llu:%llu",(unsigned long long)marker.st_dev,(unsigned long long)marker.st_ino);snprintf(ids,sizeof ids,"%s;%s;%s;%s",ri,gi,ci,mi);if(strcmp(expected,"-")&&strcmp(expected,ids))return fail();
 int working=nested(r,cwd);if(working<0)return fail();char wi[80];identity(working,wi,sizeof wi);
 long hn=read_at(g,"HEAD",head,0);if(hn<1||hn>2048)return fail();trim(head,&hn);if(memchr(head,0,(size_t)hn))return fail();long rn=0,pn=0,on=0;
 if(!strncmp((char*)head,"ref: ",5)){const char *target=(char*)head+5;if(!valid_ref(target))return fail();rn=read_at(c,target,ref,1);if(rn<0)return fail();if(!rn){pn=read_at(c,"packed-refs",packed,1);if(pn<0)return fail();}}
 if(!strcmp(op,"object")){
  size_t len=strlen(oid);if(len!=40&&len!=64)return fail();for(size_t i=0;i<len;i++)if(!strchr("0123456789abcdef",oid[i]))return fail();char path[100];snprintf(path,sizeof path,"objects/%.2s/%s",oid,oid+2);on=read_at(c,path,data,0);if(on<1)return fail();
 }
 long en=read_at(g,"HEAD",end,0);if(en<1)return fail();trim(end,&en);if(en!=hn||memcmp(end,head,(size_t)hn))return fail();
 /* Recheck control-file contents, not only their inodes: in-place edits must
  * invalidate a read just as atomic pathname replacement does. */
 if(!strncmp((char*)head,"ref: ",5)){long again=read_at(c,(char*)head+5,end,1);if(again!=rn||again<0||memcmp(end,ref,(size_t)rn))return fail();if(!rn){again=read_at(c,"packed-refs",end,1);if(again!=pn||again<0||memcmp(end,packed,(size_t)pn))return fail();}}
 if(S_ISREG(marker.st_mode)){
  long again=read_at(r,".git",end,0);if(again<1)return fail();trim(end,&again);char pointer[PATH_MAX];if(snprintf(pointer,sizeof pointer,"gitdir: %s",gd)>=(int)sizeof pointer||memchr(end,0,(size_t)again)||strcmp((char*)end,pointer))return fail();
  if(strcmp(gd,common)){
   char back[PATH_MAX],path[PATH_MAX],resolved[PATH_MAX];again=read_at(g,"gitdir",end,0);if(again<1)return fail();trim(end,&again);if(snprintf(back,sizeof back,"%s/.git",root)>=(int)sizeof back||memchr(end,0,(size_t)again)||strcmp((char*)end,back))return fail();
   again=read_at(g,"commondir",end,0);if(again<1)return fail();trim(end,&again);if(memchr(end,0,(size_t)again))return fail();if(end[0]=='/'){if(strlen((char*)end)>=sizeof path)return fail();strcpy(path,(char*)end);}else if(snprintf(path,sizeof path,"%s/%s",gd,end)>=(int)sizeof path)return fail();if(!normalized(path,resolved)||strcmp(resolved,common))return fail();
  }
 }
 if(!strcmp(gd,common)){struct stat unexpected;if(!fstatat(g,"commondir",&unexpected,AT_SYMLINK_NOFOLLOW)||errno!=ENOENT)return fail();}
 int r2=absolute(root),g2=absolute(gd),c2=absolute(common),w2=nested(r,cwd);struct stat m2;
 if(r2<0||g2<0||c2<0||w2<0||!same(r,r2)||!same(g,g2)||!same(c,c2)||!same(working,w2)||fstatat(r,".git",&m2,AT_SYMLINK_NOFOLLOW)||marker.st_dev!=m2.st_dev||marker.st_ino!=m2.st_ino)return fail();
 if(getppid()!=parent)return fail();
 printf("{\"version\":1,\"identity\":\"%s\",\"cwdIdentity\":\"%s\",",ids,wi);hex("head",head,hn);putchar(',');hex("ref",ref,rn);putchar(',');hex("packed",packed,pn);putchar(',');hex("object",data,on);puts("}");
 return 0;
}
