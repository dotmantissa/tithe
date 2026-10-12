from conftest import SOURCE,USAGE,encoded,panel,appeal,RULING_KEYS
import pytest
from conftest import URL, HASH, TERMS, PRICES


def test_registration_and_creator_index(direct_vm, direct_deploy, direct_alice, evidence):
    contract = direct_deploy('contracts/work_registry.py')
    direct_vm.sender = direct_alice
    key = contract.register_work(URL, HASH, TERMS, PRICES, 'commercial', 'Orchard', artifact_base64=encoded(SOURCE))
    record = contract.get_work(key)
    assert record['content_hash'] == HASH and record['version'] == 1
    assert record['terms']['clauses'][1].startswith('C2:')
    assert contract.get_creator_works(("0x" + direct_alice.hex())) == [key]
    assert contract.list_works()[0]['title'] == 'Orchard'
    assert contract.get_count() == 1
    with direct_vm.expect_revert('already registered'):
        contract.register_work(URL, HASH, TERMS, PRICES, 'commercial', artifact_base64=encoded(SOURCE))


def test_terms_are_immutable_and_historical(direct_vm, direct_deploy, direct_alice, direct_bob, evidence):
    contract = direct_deploy('contracts/work_registry.py')
    direct_vm.sender = direct_alice
    key = contract.register_work(URL, HASH, TERMS, PRICES, 'commercial', artifact_base64=encoded(SOURCE))
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('Only the creator'):
        contract.update_terms(key, 'All use is prohibited.', PRICES, 'commercial')
    direct_vm.sender = direct_alice
    direct_vm.warp('2026-01-02T12:00:00Z')
    assert contract.update_terms(key, 'All use is prohibited.', PRICES, 'commercial') == 2
    assert contract.get_work(key)['version'] == 2
    assert contract.get_terms(key, 1)['terms_text'] == TERMS
    assert contract.get_terms_at(key, 1767268800)['version'] == 1
    with direct_vm.expect_revert('predates'):
        contract.get_terms_at(key, 1)


@pytest.mark.parametrize('url,hash_,terms,prices,category,error',[
 ('http://example.org/a',HASH,TERMS,PRICES,'commercial','HTTPS'),
 ('https://127.0.0.1/a',HASH,TERMS,PRICES,'commercial','Private'),
 (URL,'bad',TERMS,PRICES,'commercial','SHA256'),
 (URL,'0'*64,TERMS,PRICES,'commercial','hash changed'),
 (URL,HASH,'',PRICES,'commercial','clauses'),
 (URL,HASH,TERMS,'{"commercial":-1}','commercial','decimal strings'),
 (URL,HASH,TERMS,PRICES,'invalid','Default'),
])
def test_bad_inputs(direct_vm,direct_deploy,evidence,url,hash_,terms,prices,category,error):
    contract=direct_deploy('contracts/work_registry.py')
    with direct_vm.expect_revert(error):
        contract.register_work(url,hash_,terms,prices,category, artifact_base64=encoded(SOURCE))
    assert contract.get_count()==0


def test_rejects_missing_committed_bytes(direct_vm,direct_deploy):
    contract=direct_deploy('contracts/work_registry.py')
    direct_vm.mock_web(r'.*',{'status':503,'body':b''})
    with direct_vm.expect_revert('Commit artifact bytes'):
        contract.register_work(URL,HASH,TERMS,PRICES,'commercial')


def test_still_image_registration(direct_vm,direct_deploy):
    import hashlib
    import base64
    raw=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGP4DwYMEAoAU7oL9ZisIGcAAAAASUVORK5CYII=')
    direct_vm.mock_web(r'.*',{'status':200,'body':raw})
    contract=direct_deploy('contracts/work_registry.py')
    key=contract.register_work(URL,hashlib.sha256(raw).hexdigest(),TERMS,PRICES,'commercial', artifact_base64=encoded(raw))
    assert contract.get_work(key)['kind']=='image'


def test_same_second_terms_need_stable_explicit_version(direct_vm,direct_deploy,direct_alice,evidence):
    c=direct_deploy('contracts/work_registry.py');direct_vm.sender=direct_alice
    key=c.register_work(URL,HASH,TERMS,PRICES,'commercial', artifact_base64=encoded(SOURCE))
    timestamp=c.get_work(key)['registered_at']
    c.update_terms(key,'All commercial use is prohibited.',PRICES,'commercial')
    with direct_vm.expect_revert('multiple terms versions'):c.get_terms_at(key,timestamp)
    assert c.get_terms_at(key,timestamp,1)['terms']['terms_text']==TERMS
    assert c.get_terms_at(key,timestamp,2)['version']==2
    assert len(c.get_terms_versions_at(key,timestamp))==2
    with direct_vm.expect_revert('not in force'):c.get_terms_at(key,timestamp,3)


def test_snapshot_tracks_terms_not_only_collection_size(direct_vm,direct_deploy,direct_alice,evidence):
    c=direct_deploy('contracts/work_registry.py');direct_vm.sender=direct_alice
    assert c.get_snapshot()=={'count':0,'revision':0}
    key=c.register_work(URL,HASH,TERMS,PRICES,'commercial', artifact_base64=encoded(SOURCE))
    assert c.get_snapshot()=={'count':1,'revision':1}
    c.update_terms(key,TERMS,PRICES,'commercial')
    assert c.get_snapshot()=={'count':1,'revision':2}
