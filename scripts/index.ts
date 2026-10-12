import {syncIndex} from '../src/lib/indexer';
const progress=await syncIndex();
console.log(`Index advanced by ${progress.processed} records; ${progress.completed} collections completed a stable snapshot. Run again to continue saved pages.`);
