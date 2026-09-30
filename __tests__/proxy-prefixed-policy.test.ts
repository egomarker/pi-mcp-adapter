import {describe,expect,it,vi} from 'vitest';
import {executeCall} from '../proxy-modes.ts';
import {formatToolName} from '../types.ts';

describe('prefixed proxy policy before connection',()=>{
 it('denies excluded and non-included names without connecting',async()=>{
  const connect=vi.fn(),getConnection=vi.fn(()=>undefined);
  const state:any={config:{settings:{toolPrefix:'server'},mcpServers:{workiq:{command:'workiq',includeTools:['retrieve'],excludeTools:['delete_*']}}},manager:{connect,getConnection,isConnecting:()=>false},toolMetadata:new Map(),failureTracker:new Map(),failureMessages:new Map(),serverInstructions:new Map(),completedUiSessions:[]};
  for(const raw of ['delete_entity','unknown']){
   const result=await executeCall(state,formatToolName(raw,'workiq','server'),{});
   expect(result.details).toMatchObject({error:'tool_not_found'});
  }
  expect(connect).not.toHaveBeenCalled();expect(getConnection).not.toHaveBeenCalled();
 });
});
