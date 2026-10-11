import json
import pytest
from conftest import URL,HASH


def court(direct_deploy,direct_vm,direct_alice):
    c=direct_deploy('contracts/infringement_court.py','0x'+'1'*40,'0x'+'2'*40,100)
    # Direct mode deliberately substitutes embeddings; live tests use ONNX.
    import gltest.direct.loader as loader
    loader._mock_embeddings_for_direct_mode()
    import genlayer_embeddings,sys
    sys.modules[c.__module__].SentenceTransformer = genlayer_embeddings.SentenceTransformer
    direct_vm.sender=direct_alice
    direct_vm.value=100
    return c


def claim(c,work,bob):
    return c.file_claim(work['work_id'],URL,HASH,("0x" + bob.hex()),1767268800)


@pytest.mark.parametrize('decision,band,creator_credit,respondent_credit',[
 ('USE','LOW',125,75),('USE','MEDIUM',150,50),('USE','HIGH',200,0),
 ('NO_USE','NONE',0,200),('DERIVATIVE_WITHIN_TERMS','NONE',100,100)
])
def test_bonds_ruling_and_settlement(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,decision,band,creator_credit,respondent_credit):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    with direct_vm.expect_revert('Both parties'):
        c.rule(key)
    direct_vm.sender=direct_bob
    c.respond(key)
    direct_vm.mock_llm(r'Tithe dispute panel.*',json.dumps({'decision':decision,'clause':'C2','damages_band':band,'reason':'The committed output was assessed against the registered clause.'}))
    ruling=c.rule(key)
    assert ruling['distance_ppm']==0
    assert direct_vm.run_validator()
    for field,value in [('decision','INVALID'),('clause','C1'),('damages_band','HIGH' if band!='HIGH' else 'LOW'),('distance_ppm',100000)]:
        assert not direct_vm.run_validator(leader_result={**ruling,field:value})
    with direct_vm.expect_revert('open to network appeal'):
        c.settle(key)
    direct_vm.warp('2026-01-04T12:00:00Z')
    c.settle(key)
    assert c.get_account(("0x" + direct_alice.hex()))['credit_atto']==str(creator_credit)
    assert c.get_account(("0x" + direct_bob.hex()))['credit_atto']==str(respondent_credit)
    assert c.get_account(("0x" + direct_bob.hex()))['escrow_atto']=='0'
    with direct_vm.expect_revert('open to network appeal'):
        c.settle(key)


def test_claim_access_and_response_bond(direct_deploy,direct_vm,direct_alice,direct_bob,direct_charlie,external_views):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    direct_vm.sender=direct_bob
    with direct_vm.expect_revert('Only the registered creator'):
        claim(c,work,direct_bob)
    direct_vm.sender=direct_alice
    key=claim(c,work,direct_bob)
    direct_vm.sender=direct_charlie
    with direct_vm.expect_revert('Only the respondent'):
        c.respond(key)
    direct_vm.sender=direct_bob
    direct_vm.value=99
    with direct_vm.expect_revert('exact response bond'):
        c.respond(key)


def test_unanswered_claim_returns_bond_without_verdict(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    with direct_vm.expect_revert('still open'):
        c.cancel_unanswered(key)
    direct_vm.warp('2026-01-10T12:00:00Z')
    c.cancel_unanswered(key)
    assert c.get_claim(key)['status']=='CLOSED_WITHOUT_RULING'
    assert c.get_account(("0x" + direct_alice.hex()))['credit_atto']=='100'


def test_rejects_someone_elses_licence(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,licences=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    licences['wrong']={'decision':'APPROVE','holder':("0x" + direct_alice.hex()),'work_id':work['work_id'],'issued_at':1,'terms_version':1}
    direct_vm.sender=direct_bob
    with direct_vm.expect_revert('does not cover'):
        c.respond(key,'','wrong')


def test_invalid_damages_cannot_move_money(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    direct_vm.sender=direct_bob
    c.respond(key)
    direct_vm.mock_llm(r'.*',json.dumps({'decision':'NO_USE','clause':'C1','damages_band':'HIGH','reason':'This output does not establish use of the work.'}))
    with direct_vm.expect_revert('Invalid damages'):
        c.rule(key)
    assert c.get_claim(key)['status']=='READY'
