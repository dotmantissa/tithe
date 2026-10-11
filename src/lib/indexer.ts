import { read } from './chain';
import { database } from './db';
import type { Work, Licence, Claim } from './types';

export async function syncIndex() {
  const sql = database();
  for (const [contract, method, kind] of [['registry','list_works','work'],['desk','list_licences','licence'],['court','list_claims','claim']] as const) {
    const count = await read<number>(contract,'get_count');
    for (let offset=0; offset<count; offset+=50) {
      const records = await read<(Work | Licence | Claim)[]>(contract,method,[offset,50]);
      for (const record of records) {
        if (kind==='work') {
          const work = record as Work;
          await sql`INSERT INTO tithe_works(id,creator,title,kind,document) VALUES(${work.work_id},${work.creator},${work.title},${work.kind},${JSON.stringify(work)}::jsonb) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,document=EXCLUDED.document,indexed_at=now()`;
        } else {
          const id = kind==='licence' ? (record as Licence).licence_id : (record as Claim).claim_id;
          const account = kind==='licence' ? (record as Licence).holder : (record as Claim).claimant;
          await sql`INSERT INTO tithe_records(id,kind,account,document) VALUES(${id},${kind},${account},${JSON.stringify(record)}::jsonb) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document,indexed_at=now()`;
        }
      }
    }
  }
}
