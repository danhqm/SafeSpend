import assert from "node:assert/strict";
import test from "node:test";
import { calculateClaims, parseAmount, validDate, type TaxClaim } from "../types/tax.ts";
const claim = (rule_id: string, amount: number, extra: Partial<TaxClaim> = {}): TaxClaim => ({
 id:rule_id,tax_year:2025,rule_id,rule_version:"2025.1",receipt_id:null,
 title:"Test",amount,eligible_amount:amount,status:"confirmed",beneficiary:"Self",
 evidence_note:"Statement",eligibility_confirmed:true,occurred_on:"2025-06-01",...extra,
});
test("sports and general lifestyle have independent caps",()=>{
 assert.equal(calculateClaims([claim("lifestyle",2500),claim("sports",1000)],2025).total,3500);
});
test("medical sublimits apply before the shared medical cap",()=>{
 const result=calculateClaims([claim("medical",9500),claim("dental",3000),claim("vaccination",2000)],2025);
 assert.equal(result.total,10000);
 assert.equal(result.rows.find(r=>r.rule.id==="checkup")?.remaining,0);
 assert.equal(result.rows.find(r=>r.rule.id==="vaccination")?.allowed,500);
 assert.equal(result.rows.find(r=>r.rule.id==="dental")?.excluded,3000);
 assert.equal(calculateClaims([claim("dental",3000)],2025).total,1000);
});
test("education, childcare and SSPN do not share an artificial cap",()=>{
 assert.equal(calculateClaims([claim("education",7000),claim("childcare",3000),claim("sspn",8000)],2025).total,18000);
 assert.equal(calculateClaims([claim("skills",4000)],2025).total,2000);
});
test("unreviewed AI drafts, excluded claims, wrong years and old versions never count",()=>{
 const list=[claim("lifestyle",500,{status:"needs_review"}),claim("sports",500,{status:"rejected"}),
 claim("medical",500,{eligibility_confirmed:false}),claim("prs",500,{tax_year:2026}),
 claim("socso",300,{rule_version:"old"})];
 assert.equal(calculateClaims(list,2025).total,0);
 assert.equal(calculateClaims(list,2026).available,false);
});
test("only the eligible portion counts, and fixed personal relief cannot accumulate",()=>{
 assert.equal(calculateClaims([claim("lifestyle",100,{amount:800})],2025).total,100);
 assert.equal(calculateClaims([claim("individual",9000),claim("individual",9000)],2025).total,9000);
});
test("money parsing and date checks reject ambiguous or invalid input",()=>{
 assert.equal(parseAmount("12.34"),12.34);
 for(const value of ["", "-1", "1e3", "1,000", "NaN", "1.234"]) assert.equal(parseAmount(value),null);
 assert.equal(validDate("2025-02-29",2025),false);
 assert.equal(validDate("2024-02-29",2025),false);
 assert.equal(validDate("2025-12-31",2025),true);
});
