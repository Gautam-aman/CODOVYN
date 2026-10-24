/* FEASIBILITY PROBE ONLY: immutable replies, no subprocesses or Git passthrough.
 * This deliberately does not establish repository freshness or authorize linked
 * metadata roots. Do not install it in the production provider boundary. */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <limits.h>
#include "snapshot.h"
static int denied(void) { fputs("CODOVYN discovery probe: operation denied\n",stderr); return 126; }
int main(int argc,char **argv) {
  char cwd[PATH_MAX],canonical[PATH_MAX];
  if(argc<2 || argc>9 || !getcwd(cwd,sizeof cwd) || !realpath(cwd,canonical)) return denied();
  size_t length=strlen(root);
  if(strncmp(canonical,root,length) || (canonical[length] && canonical[length]!='/')) return denied();
  for(int i=1;i<argc;i++) if(strlen(argv[i])>4096) return denied();
  int start=1;
  if(argc>=5 && !strcmp(argv[1],"--git-dir")) {
    if(strcmp(argv[2],gitDirectory) || strcmp(argv[3],"--work-tree") || strcmp(argv[4],root)) return denied();
    start=5;
  }
  char **v=argv+start;int count=argc-start;
  if(count==4 && !strcmp(v[0],"rev-parse") && !strcmp(v[1],"--git-dir") && !strcmp(v[2],"--git-common-dir") && !strcmp(v[3],"--show-toplevel")) {
    printf("%s\n%s\n%s\n",gitDirectory,commonDirectory,root);return 0;
  }
  if(count==2 && !strcmp(v[0],"rev-parse") && !strcmp(v[1],"HEAD")) { if(!*head)return 1;puts(head);return 0; }
  if(count==3 && !strcmp(v[0],"rev-list") && !strcmp(v[1],"--max-parents=0") && !strcmp(v[2],"HEAD")) { if(!*roots)return 1;puts(roots);return 0; }
  if(count==4 && !strcmp(v[0],"symbolic-ref") && !strcmp(v[1],"--quiet") && !strcmp(v[2],"--short") && !strcmp(v[3],"HEAD")) { if(!*branch)return 1;puts(branch);return 0; }
  return denied();
}
