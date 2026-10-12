import {withRpcClass} from '../src/lib/rpc-context';
import {syncIndex} from '../src/lib/indexer';
const progress=await withRpcClass('maintenance',()=>syncIndex());
console.log(`Index advanced by ${progress.processed} records; ${progress.completed} append-only prefixes completed. Run again to continue saved pages.`);
