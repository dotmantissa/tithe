import type {RpcClass} from './rpc-context';
// Shared by the wire guard and isolated real-database concurrency tests.
export function rpcReservationQuery(kind:RpcClass,table='tithe_rpc_events'){
 if(!/^tithe_rpc_(events|test_[a-f0-9]+)$/.test(table))throw new Error('Invalid RPC meter table');
 return {query:`INSERT INTO ${table}(created_at,traffic_class) SELECT now(),$1 WHERE
  (SELECT count(*) FROM ${table} WHERE created_at>now()-interval '1 hour')<400 AND
  (SELECT count(*) FROM ${table} WHERE created_at>now()-interval '1 minute')<35 AND
  ($2 OR ((SELECT count(*) FROM ${table} WHERE traffic_class<>'recovery' AND created_at>now()-interval '1 hour')<300 AND (SELECT count(*) FROM ${table} WHERE traffic_class<>'recovery' AND created_at>now()-interval '1 minute')<25)) AND
  ($1<>'public' OR ((SELECT count(*) FROM ${table} WHERE traffic_class='public' AND created_at>now()-interval '1 hour')<80 AND (SELECT count(*) FROM ${table} WHERE traffic_class='public' AND created_at>now()-interval '1 minute')<10)) AND
  ($1<>'maintenance' OR ((SELECT count(*) FROM ${table} WHERE traffic_class='maintenance' AND created_at>now()-interval '1 hour')<120 AND (SELECT count(*) FROM ${table} WHERE traffic_class='maintenance' AND created_at>now()-interval '1 minute')<15)) RETURNING id`,params:[kind,kind==='recovery']};
}
