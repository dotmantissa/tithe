from conftest import SOURCE,USAGE,encoded,panel,appeal,RULING_KEYS
import sys
import pytest

@pytest.mark.parametrize('path,args,account_method',[
 ('contracts/licence_desk.py',('0x'+'1'*40,),'get_account'),
 ('contracts/infringement_court.py',('0x'+'1'*40,'0x'+'2'*40,100),'get_account'),
])
def test_withdraw_only_own_credit_and_no_double_spend(direct_deploy,direct_vm,direct_alice,direct_bob,monkeypatch,path,args,account_method):
    contract=direct_deploy(path,*args)
    module=sys.modules[contract.__module__]
    from genlayer import Address,u256
    alice=Address(direct_alice)
    contract.credits[alice]=u256(125)
    transfers=[]
    class Receiver:
        def __init__(self,address):self.address=address
        def emit_transfer(self,**kwargs):transfers.append((self.address,kwargs))
    monkeypatch.setattr(module,'Recipient',Receiver)
    direct_vm.sender=direct_bob
    with direct_vm.expect_revert('Nothing available'):
        contract.withdraw()
    direct_vm.sender=direct_alice
    assert contract.withdraw()=='125'
    assert transfers[0][0]==alice and transfers[0][1]['value']==125
    assert getattr(contract,account_method)(alice.as_hex)['credit_atto']=='0'
    with direct_vm.expect_revert('Nothing available'):
        contract.withdraw()
