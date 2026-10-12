import json
import pytest
from conftest import URL, HASH
from test_desk import setup_desk, answer
from test_court import court, claim

@pytest.mark.parametrize('extra',[
    {'creator':'0x'+'f'*40}, {'holder':'0x'+'f'*40}, {'fee_atto':'200'},
    {'release_at':0}, {'terms_version':99}, {'intended_use':'Unrestricted use'},
    {'reason':'Unlimited commercial use is granted.'}, {'decision':True},
])
def test_desk_rejects_every_unbound_leader_field(direct_deploy,direct_vm,direct_bob,external_views,extra):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert not direct_vm.run_validator(leader_result={'decision':'APPROVE','clause':'C2',**extra})


def test_desk_canonical_metadata_and_explanation_cannot_redirect_escrow(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,monkeypatch):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    first=desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    from genlayer import gl
    def hostile(assess,validator):
        result={**assess(),'creator':'0x'+direct_bob.hex(),'fee_atto':'200','release_at':0}
        assert not validator(gl.vm.Return(calldata=result))
        return result
    monkeypatch.setattr(gl.vm,'run_nondet_unsafe',hostile)
    with direct_vm.expect_revert('Unexpected consensus fields'):
        desk.request_licence(work['work_id'],'Another commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_count()==1
    assert desk.get_licence(first)['creator']==work['creator']
    assert desk.get_account('0x'+direct_alice.hex())['escrow_atto']=='100'
    assert desk.get_account('0x'+direct_bob.hex())['credit_atto']=='0'


@pytest.mark.parametrize('extra',[{'reason':{'invalid':'text'}},{'reason':'A conflicting permission.'},{'distance_ppm':-1},{'distance_ppm':True},{'distance_ppm':4000001},{'policy_hash':'not-a-hash'},{'creator':'0x'+'f'*40}])
def test_court_rejects_malformed_and_unbound_leader_fields(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,extra):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    direct_vm.sender=direct_bob
    c.respond(key)
    direct_vm.mock_llm(r'Tithe dispute panel.*',json.dumps({'decision':'USE','clause':'C2','damages_band':'LOW'}))
    ruling=c.rule(key)
    candidate={k:ruling[k] for k in ['decision','clause','damages_band','distance_ppm','policy_hash']}
    assert direct_vm.run_validator(leader_result=candidate)
    assert not direct_vm.run_validator(leader_result={**candidate,**extra})
    assert 'recorded condition' in ruling['reason']

@pytest.mark.parametrize('version,fee',[(0,''),(2,'100'),(1,'99'),(1,'1000')])
def test_stale_or_missing_fee_consent_cannot_create_licence(direct_deploy,direct_vm,direct_bob,external_views,version,fee):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    with direct_vm.expect_revert('Terms or price changed'):
        desk.request_licence(work['work_id'],'Commercial use with attribution.','commercial',version,fee)
    assert desk.get_count()==0
    assert desk.get_account('0x'+direct_bob.hex())['credit_atto']=='0'
