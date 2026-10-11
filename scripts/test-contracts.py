"""Run direct tests using the official runner bundle downloaded by the linter."""
import os
from pathlib import Path
import shutil
import sys

os.environ['PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION']='python'
import google.protobuf.internal.api_implementation
import pytest
from genvm_linter.validate.artifacts import download_artifacts
from gltest.direct.sdk_loader import CACHE_DIR

source=download_artifacts()
CACHE_DIR.mkdir(parents=True,exist_ok=True)
target=CACHE_DIR/source.name
if not target.exists():
    temporary=target.with_suffix('.tmp')
    shutil.copyfile(source,temporary)
    temporary.replace(target)
print('Direct tests use the official GenVM bundle:',source.name)
root=Path(__file__).resolve().parent.parent
os.chdir(root)
sys.exit(pytest.main(['tests/direct',*sys.argv[1:]]))
