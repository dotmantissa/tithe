import json
import pytest


def setup_desk(direct_deploy,direct_vm,direct_bob):
    contract=direct_deploy('contracts/licence_desk.py','0x'+'1'*40)
    direct_vm.sender=direct_bob
    direct_vm.value=100
    return contract


def answer(direct_vm,decision='APPROVE',clause='C2'):
    direct_vm.mock_llm(r'Tithe licence panel.*',json.dumps({'decision':decision,'clause':clause,'reason':'The proposed use follows the registered commercial clause.'}))


def test_approve_escrow_release_once(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    key=desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_licence(key)['terms_version']==1
    assert desk.get_account(("0x" + direct_alice.hex()))['escrow_atto']=='100'
    assert direct_vm.run_validator()
    with direct_vm.expect_revert('still in escrow'):
        desk.release_fee(key)
    direct_vm.warp('2026-01-03T12:00:00Z')
    desk.release_fee(key)
    assert desk.get_account(("0x" + direct_alice.hex()))['credit_atto']=='100'
    with direct_vm.expect_revert('not awaiting'):
        desk.release_fee(key)


def test_refuse_refunds_and_disagreement(direct_deploy,direct_vm,direct_bob,external_views):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm,'REFUSE')
    key=desk.request_licence(work['work_id'],'Competing commercial reproduction.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_licence(key)['decision']=='REFUSE'
    assert desk.get_account(("0x" + direct_bob.hex()))['credit_atto']=='100'
    assert desk.get_account(("0x" + direct_bob.hex()))['escrow_atto']=='0'
    assert not direct_vm.run_validator(leader_result={'decision':'APPROVE','clause':'C2','reason':'Invented approval'})
    assert not direct_vm.run_validator(leader_result={'decision':'REFUSE','clause':'C1','reason':'Wrong clause'})


@pytest.mark.parametrize('value,description,category,error',[(99,'Commercial reproduction.','commercial','exact published'),(100,'short','commercial','Describe'),(100,'Commercial reproduction.','unknown','No price')])
def test_request_validation(direct_deploy,direct_vm,direct_bob,external_views,value,description,category,error):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    direct_vm.value=value
    with direct_vm.expect_revert(error):
        desk.request_licence(work['work_id'],description,category, expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_count()==0


@pytest.mark.parametrize('raw',['not JSON','{"decision":"APPROVE","clause":"C99","reason":"Enough explanation."}','{"decision":"MAYBE","clause":"C1","reason":"Enough explanation."}'])
def test_bad_llm_fails_closed(direct_deploy,direct_vm,direct_bob,external_views,raw):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    direct_vm.mock_llm(r'.*',raw)
    with direct_vm.expect_revert('LLM_ERROR'):
        desk.request_licence(work['work_id'],'Commercial reproduction.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_count()==0


def test_snapshot_tracks_fee_release(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;desk=setup_desk(direct_deploy,direct_vm,direct_bob);answer(direct_vm)
    key=desk.request_licence(work['work_id'],'Commercial use with attribution.',expected_terms_version=1,expected_fee_atto='100')
    assert desk.get_snapshot()=={'count':1,'revision':1}
    direct_vm.warp('2026-01-03T12:00:00Z');desk.release_fee(key)
    assert desk.get_snapshot()=={'count':1,'revision':2}
