"""Validate contracts with the same protobuf implementation as GenVM."""
import os
from pathlib import Path
import subprocess
import sys

os.environ['PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION']='python'
root=Path(__file__).resolve().parent.parent
for name in ('work_registry','licence_desk','infringement_court'):
    subprocess.run([sys.executable,'-c','import google.protobuf.internal.api_implementation; from genvm_linter.cli import cli; cli()','check',str(root/'contracts'/f'{name}.py')],check=True)
