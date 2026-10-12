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
        registry.register_work(URL,hashlib.sha256(raw).hexdigest(),TERMS,PRICES,'commercial')
    assert registry.get_count()==0

@pytest.mark.parametrize('raw', ANIMATIONS)
def test_desk_refuses_animation_even_when_registry_view_is_imported(direct_deploy,direct_vm,direct_bob,external_views,raw):
    work,_=external_views
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
    key=c.file_claim(work['work_id'],output,hashlib.sha256(raw).hexdigest(),'0x'+direct_bob.hex(),1767268800)
    direct_vm.sender=direct_bob
    c.respond(key)
    with direct_vm.expect_revert('Animated images'):
        c.rule(key)
    assert c.get_claim(key)['status']=='READY'


def image_evidence(direct_vm,work):
    import base64
    raw=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSj8AAAAASUVORK5CYII=')
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


@pytest.mark.parametrize('valid',[True,False])
def test_court_image_descriptions_are_validated(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,monkeypatch,valid):
    work,_=external_views
    raw=image_evidence(direct_vm,work)
    c=court(direct_deploy,direct_vm,direct_alice)
    key=c.file_claim(work['work_id'],URL,work['content_hash'],'0x'+direct_bob.hex(),1767268800)
    direct_vm.sender=direct_bob
    c.respond(key)
    from genlayer import gl
    seen=[]
    def assess(prompt,*,images,response_format):
        seen.append(images)
        if prompt.startswith('Describe each image'):
            return {'source':'A white single pixel image.','output':'A white single pixel image.'} if valid else {'source':7}
        return {'decision':'DERIVATIVE_WITHIN_TERMS','clause':'C1','damages_band':'NONE','reason':'The registered terms permit this image use with attribution.'}
    monkeypatch.setattr(gl.nondet,'exec_prompt',assess)
    if valid:
        ruling=c.rule(key)
        assert ruling['distance_ppm']==0
        assert direct_vm.run_validator()
        assert all(images==[raw,raw] for images in seen)
    else:
        with direct_vm.expect_revert('Image descriptions missing'):
            c.rule(key)
        assert c.get_claim(key)['status']=='READY'
