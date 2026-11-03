import { expect, it } from "vitest";
import { coreCanManage, coreCanRead, emptyCoreGraph, type CoreActor } from "../../src/domain/trip/tripCoreV2Mutation";
const actor: CoreActor = { accountId:"11111111-1111-4111-8111-111111111111",tripId:"22222222-2222-4222-8222-222222222222",active:true,canManageShared:true,personId:"33333333-3333-4333-8333-333333333333",personIds:["33333333-3333-4333-8333-333333333333"] };
const row={id:"44444444-4444-4444-8444-444444444444",trip_id:actor.tripId,owner_account_id:"55555555-5555-4555-8555-555555555555",visibility:"GROUP",participation_mode:"SELF",participant_scope:"ASSIGNED"};
it.each(["GROUP","SELECTED_PERSONS"])("management role cannot edit another creator's non-Everyone Item with %s visibility",visibility=>{
 const graph=emptyCoreGraph();
 if(visibility==="SELECTED_PERSONS")graph.trip_item_visibility_people.push({item_id:row.id,person_id:actor.personId});
 const item={...row,visibility};
 expect(coreCanRead(graph,actor,"ITEM",item)).toBe(true);
 expect(coreCanManage(graph,actor,"ITEM",item)).toBe(false);
});
it("retains own creator edit control",()=>{expect(coreCanManage(emptyCoreGraph(),actor,"ITEM",{...row,owner_account_id:actor.accountId})).toBe(true);});
it("does not give the managing actor another creator's PRIVATE Item",()=>{expect(coreCanRead(emptyCoreGraph(),actor,"ITEM",{...row,visibility:"PRIVATE"})).toBe(false);expect(coreCanManage(emptyCoreGraph(),actor,"ITEM",{...row,visibility:"PRIVATE"})).toBe(false);});
