"""Validate contracts with the same protobuf implementation as GenVM."""
import os
from pathlib import Path
import subprocess

os.environ['PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION']='python'
root=Path(__file__).resolve().parent.parent
for name in ('work_registry','licence_desk','infringement_court'):
    subprocess.run(['genvm-lint','check',str(root/'contracts'/f'{name}.py')],check=True)
