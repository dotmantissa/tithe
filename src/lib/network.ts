import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
// Node's short connection race can fail healthy endpoints on slower networks.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);
setDefaultAutoSelectFamilyAttemptTimeout(3000);
