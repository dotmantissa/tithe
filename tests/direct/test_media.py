from conftest import SOURCE,USAGE,encoded,panel,appeal,RULING_KEYS
from conftest import fund
import hashlib
import pytest
from conftest import URL, TERMS, PRICES
from test_court import court
from test_desk import setup_desk

ANIMATIONS = [
    b'\x89PNG\r\n\x1a\n' + (8).to_bytes(4,'big') + b'acTL' + b'\x00'*12,
    b'RIFF' + (12).to_bytes(4,'little') + b'WEBPANIM' + (0).to_bytes(4,'little'),
]

@pytest.mark.parametrize('raw', ANIMATIONS)
def test_registry_refuses_animation(direct_deploy,direct_vm,raw):
    direct_vm.mock_web(r'.*',{'status':200,'body':raw})
    registry=direct_deploy('contracts/work_registry.py')
    with direct_vm.expect_revert('Animated images'):
        registry.register_work(URL,hashlib.sha256(raw).hexdigest(),TERMS,PRICES,'commercial', artifact_base64=encoded(raw))
    assert registry.get_count()==0

@pytest.mark.parametrize('raw', ANIMATIONS)
def test_desk_refuses_animation_even_when_registry_view_is_imported(direct_deploy,direct_vm,direct_bob,external_views,raw):
    work,_=external_views
    work['artifact_base64']=encoded(raw)
    work['content_hash']=hashlib.sha256(raw).hexdigest()
    direct_vm.clear_mocks()
    direct_vm.mock_web(r'.*',{'status':200,'body':raw})
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    with direct_vm.expect_revert('Animated images'):
        desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_count()==0

@pytest.mark.parametrize('raw', ANIMATIONS)
def test_court_refuses_animated_output(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,raw):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    output='https://example.org/animated.png'
    direct_vm.clear_mocks()
    from conftest import SOURCE
    direct_vm.mock_web(r'https://example.org/orchard.txt',{'status':200,'body':SOURCE})
    direct_vm.mock_web(r'https://example.org/animated.png',{'status':200,'body':raw})
    with direct_vm.expect_revert('Animated images'):
        c.file_claim(work['work_id'],output,hashlib.sha256(raw).hexdigest(),'0x'+direct_bob.hex(),1767268800,terms_version=1, output_base64=encoded(raw), usage_json=USAGE)
    assert c.get_count()==0


def image_evidence(direct_vm,work):
    import base64
    raw=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGP4DwYMEAoAU7oL9ZisIGcAAAAASUVORK5CYII=')
    work['artifact_base64']=encoded(raw)
    work['content_hash']=hashlib.sha256(raw).hexdigest()
    work['kind']='image'
    direct_vm.clear_mocks()
    direct_vm.mock_web(r'.*',{'status':200,'body':raw})
    return raw


def test_desk_passes_still_image_to_the_panel(direct_deploy,direct_vm,direct_bob,external_views,monkeypatch):
    work,_=external_views
    raw=image_evidence(direct_vm,work)
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    from genlayer import gl
    seen=[]
    def assess(prompt,*,images,response_format):
        seen.append(images)
        return {'decision':'APPROVE','clause':'C2','reason':'The proposed image use follows the registered commercial clause.'}
    monkeypatch.setattr(gl.nondet,'exec_prompt',assess)
    key=desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_licence(key)['decision']=='APPROVE'
    assert direct_vm.run_validator()
    assert seen==[[raw],[raw]]


def test_court_image_signature_is_reproducible(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,monkeypatch):
    work,_=external_views
    raw=image_evidence(direct_vm,work)
    c=court(direct_deploy,direct_vm,direct_alice)
    key=c.file_claim(work['work_id'],URL,work['content_hash'],'0x'+direct_bob.hex(),1767268800, terms_version=1, output_base64=encoded(raw), usage_json=USAGE)
    direct_vm.sender=direct_bob
    fund(c,direct_vm,100)
    c.respond(key, accepted_used_at=1767268800, accepted_terms_version=1, usage_json=USAGE)
    from genlayer import gl
    seen=[]
    def assess(prompt,*,images,response_format):
        seen.append(images)
        if prompt.startswith('Tithe reasoning verification'):return {'supported':True}
        assert 'spatial color signature' in prompt
        return panel({'decision':'DERIVATIVE_WITHIN_TERMS','clause':'C1','damages_band':'NONE'})
    monkeypatch.setattr(gl.nondet,'exec_prompt',assess)
    ruling=c.rule(key)
    assert ruling['distance_ppm']==0
    assert direct_vm.run_validator()
    assert all(images==[raw,raw] for images in seen)

@pytest.mark.parametrize('contract',['work_registry','licence_desk','infringement_court'])
@pytest.mark.parametrize('url',['https://100.64.0.1/a','https://198.18.0.1/a','https://example.org:8443/a','https://example.org/a#fragment','https://user@example.org/a','https://private.local/a','https://example.org\\@private.local/a'])
def test_contract_url_guards_match_public_artifact_policy(direct_deploy,contract,url):
    import sys
    args=[] if contract=='work_registry' else ['0x'+'1'*40] if contract=='licence_desk' else ['0x'+'1'*40,'0x'+'2'*40,100]
    c=direct_deploy('contracts/'+contract+'.py',*args)
    from genlayer import gl
    with pytest.raises(gl.vm.UserError):sys.modules[c.__module__].public_url(url)

@pytest.mark.parametrize('raw',[b'\x89PNG\r\n\x1a\nnot-an-image',b'\xff\xd8\xffnot-an-image',b'RIFF\x00\x00\x00\x00WEBPnot-an-image'])
def test_registry_rejects_corrupt_still_images(direct_deploy,direct_vm,raw):
    c=direct_deploy('contracts/work_registry.py')
    direct_vm.mock_web(r'.*',{'status':200,'body':raw})
    expected='Invalid or unsupported still image' if raw.startswith(b'\x89PNG') else 'Convert this image to PNG'
    with direct_vm.expect_revert(expected):
        c.register_work(URL,hashlib.sha256(raw).hexdigest(),TERMS,PRICES,'commercial', artifact_base64=encoded(raw))
    assert c.get_count()==0


def test_valid_webp_is_rejected_before_native_decode(direct_deploy,direct_vm):
    import io
    from PIL import Image
    body=io.BytesIO();Image.new('RGB',(4,4),'pink').save(body,format='WEBP');raw=body.getvalue()
    direct_vm.mock_web(r'.*',{'status':200,'body':raw})
    registry=direct_deploy('contracts/work_registry.py')
    with direct_vm.expect_revert('Convert this image to PNG'):
        registry.register_work(URL,hashlib.sha256(raw).hexdigest(),TERMS,PRICES,'commercial', artifact_base64=encoded(raw))
    assert registry.get_count()==0
