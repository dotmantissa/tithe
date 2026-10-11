"""Check local credential values without printing them."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import subprocess
import sys

root=Path(__file__).resolve().parent.parent
values=[]
config=root/'.env.local'
if not config.exists():
    raise SystemExit('Local secret configuration is required for this audit.')
for line in config.read_text().splitlines():
    if not line or line.startswith('#') or '=' not in line:
        continue
    name,value=line.split('=',1)
    value=value.strip().strip('"').strip("'")
    if not value or name.startswith('NEXT_PUBLIC_') or name=='PRIVY_APP_ID':
        continue
    values.append((name,value.encode()))
    if name=='DATABASE_URL':
        password=urlsplit(value).password
        if password:
            values.append(('database password',unquote(password).encode()))
    if name=='GENLAYER_DEPLOYER_KEY' and value.startswith('0x'):
        values.append(('deployment key bytes',value[2:].encode()))
token=root/'.secrets/github-token'
if token.exists():
    values.append(('Git credential',token.read_bytes().strip()))
if not values:
    raise SystemExit('No local credentials found to check.')

def git(*args):
    return subprocess.check_output(['git',*args],cwd=root)

leaks=[]
def inspect(label,data):
    for name,value in values:
        if value and value in data:
            leaks.append((label,name))

paths=git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\0')
for relative in filter(None,paths):
    path=root/relative
    if path.is_file():
        inspect(relative,path.read_bytes())
revisions=git('rev-list','--all').decode().splitlines()
for revision in revisions:
    for relative in filter(None,git('ls-tree','-rz','--name-only',revision).decode().split('\0')):
        inspect(revision[:8]+':'+relative,git('show',revision+':'+relative))
static=root/'.next/static'
for path in static.rglob('*'):
    if path.is_file():
        inspect(str(path.relative_to(root)),path.read_bytes())
if leaks:
    for label,name in leaks:
        print('Credential match:',name,'in',label)
    sys.exit(1)
print(f'Secret audit passed: working files, {len(revisions)} commits, and public build assets checked. No credential values printed.')
