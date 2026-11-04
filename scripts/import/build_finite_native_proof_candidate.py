"""Build a definitions-only candidate from exact private preimages; never install it."""
from pathlib import Path
import hashlib
import re
import sys

PINS = {
    "58700": "6aebc8c670b2c312303a4fc0c3cbd731434cbfe6b8c2a704058d7af63fe56943",
    "66013": "c8079745b8272107675574f9d13867411058a0bd1948f36a6f7f54bf59d5b0af",
    "66014": "d81ccd66be0ce26c66f85255b3e5854f2941c664daf6e8982090c42ad6585e3d",
    "58768": "edf75ee91071d71e0802183ce9f78a56089755bb918b4282867509ab022ee096",
    "58756": "349e8d2af92e96e841469abdbfed9bb2902834e32c954ed14f9a4f1cd86ee88b",
    "66870": "7fd904cc12474a22ef2bcee4093a1691411843aa1c302d1a0f4843a0920c1628",
    "66871": "fcde32600b78f1d3a19ee654cf45cacee65e9d07b72005eebd6e3a4025ce0d10",
    "65994": "e57a456412654946148c00c7500dca5b5dda531ae6848c756b8e99549ff7c4a8",
    "66030": "a9f101431691943857383cc7e37ded502ab4c58f917f4c5fd2bc43ce8143f701",
    "66021": "6a92a7ec77d8a17e8dc1efff4b2a117fca41590763105d1e1ba8152cb35e6411",
    "66232": "7bbf5b100a86f3ca5b3af4b9bd1952640fbae0cfb2f373bc4c69b06b274c9b84",
    "66234": "01c448a9348a606ad8ee72c2fad546ca2ba2940004ebd286cc52e5eafacc1447",
    "66872": "a979e0074de782b2ba83e4467dd5d94f01fea2b222814dad9a9c8481ee37a3e2",
    "67145": "8845676f84f7635bfe9f6c7e79a198efb0bd99f47123f181646ad37dfe4268e2",
    "66243": "c1e858e911419dbb6b6fad82b09137a78b5a1b0caa964f3e6f6374628f77577e",
    "66255": "d2af73d99e18f43fe68e5a1d7b8f6d5a85f7e3953e570fc7758827f06bb8c464",
    "66263": "f2c11a313c154370a6719ddeb07cb603f5e5fcb1549802adef205cb91ace27f7",
    "67150": "385676024c66d73cde5601b51e2785a8c3b6f27abfde3a2b52bd54d59d886cea",
    "67156": "9b5eb40774d2683c8089508fb1fbcd604bb26da805a4fa848993f34dd1c8bc8a",
    "67161": "a82da69e101f95430eaab82403c2f40c763c68ed23e708f7497dbdd6aef9b6f3",
    "66035": "ff1fb5caab0de2238102ebfe52465466ae05fa5ddfd1777c97cea2e1feb62870",
    "58229": "9f1d04f062ab82cb67e792dbe6326b1d7954d07b4471bf0071f069b666ffde96",
}


def changes(oid, definition):
    if oid == "66014":
        old=" perform public.trip_source_pdf_upload_v4_gate();"
        return [(old,""" IF coalesce(current_setting('otr.universal.finite_pdf_unknown',true),'')<>'' THEN
  IF action IS DISTINCT FROM 'UNKNOWN' OR proof IS NOT NULL OR public.trip_source_finite_native_pdf_unknown(attempt,owner_run,fence) IS NOT TRUE THEN RAISE EXCEPTION 'PDF_UNKNOWN_ONLY';END IF;
  SELECT * INTO o FROM public.trip_source_operations WHERE id=(SELECT operation_id FROM public.trip_source_execution_attempts WHERE id=attempt);
  j:=public.trip_source_pdf_upload_v4_execution(attempt,owner_run,fence,action,proof);
  IF o.phase='IO_ACTIVE' THEN PERFORM public.trip_source_attempt_observe(o.id,o.operation_sha256,o.phase,o.attempt_generation,attempt,'UNKNOWN');END IF;
  RETURN j;
 END IF;
"""+old)]
    if oid == "66013":
        old=" perform public.trip_source_pdf_upload_v4_operation((select o from public.trip_source_operations o where id=a.operation_id));"
        return [(old," IF NOT (action='UNKNOWN' AND proof IS NULL AND public.trip_source_finite_native_pdf_unknown(attempt,owner_run,fence) IS TRUE) THEN\n"+old+"\n END IF;")]
    if oid == "58700":
        old=" perform public.trip_source_assert_gate();"
        return [(old,""" IF NOT (observation='UNKNOWN' AND prior_phase='IO_ACTIVE'
 AND operation::text=(nullif(current_setting('otr.universal.finite_pdf_unknown',true),'')::jsonb)->>'operationId'
 AND digest=(nullif(current_setting('otr.universal.finite_pdf_unknown',true),'')::jsonb)->>'operationSha256'
 AND public.trip_source_finite_native_pdf_unknown(attempt,
 ((nullif(current_setting('otr.universal.finite_pdf_unknown',true),'')::jsonb)->>'ownerRun')::uuid,
 ((nullif(current_setting('otr.universal.finite_pdf_unknown',true),'')::jsonb)->>'ownerFence')::bigint) IS TRUE) THEN
"""+old+"\n END IF;")]
    if oid == "58768":
        old="if j->>'command'<>family or (j->>'actor_account_id')::uuid is distinct from actor then"
        new="IF public.trip_source_universal_original_pin()->>'profile'='OTR_PNG_CAPTURE_ORIGINAL_V1' AND (actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid OR j->>'trip_id' IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a') AND public.trip_source_finite_native_command(actor,(j->>'trip_id')::uuid,raw) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;\n "+old
        return [(old,new)]
    if oid == "58756":
        old="if tg_level='STATEMENT' then return null; end if;"
        new=old+"""
 IF public.trip_source_universal_original_pin()->>'profile'='OTR_PNG_CAPTURE_ORIGINAL_V1'
 AND (public.trip_source_universal_original_pin()->>'actor' IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543' OR public.trip_source_universal_original_pin()->>'trip' IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a') THEN
  IF tg_op<>'INSERT' OR new.command IS DISTINCT FROM 'ACQUIRE_SOURCE'
  OR new.id::text IS DISTINCT FROM public.trip_source_universal_original_pin()->>'operation'
  OR new.actor_account_id::text IS DISTINCT FROM public.trip_source_universal_original_pin()->>'actor'
  OR new.trip_id::text IS DISTINCT FROM public.trip_source_universal_original_pin()->>'trip'
  OR new.source_id::text IS DISTINCT FROM public.trip_source_universal_original_pin()->>'source'
  OR new.representation_id::text IS DISTINCT FROM public.trip_source_universal_original_pin()->>'representation'
  OR new.operation_key IS DISTINCT FROM public.trip_source_universal_original_pin()->>'key'
  OR new.operation_sha256 IS DISTINCT FROM public.trip_source_universal_original_pin()->>'digest'
  THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_COMMAND_DENIED';END IF;
 END IF;"""
        negative=""" IF coalesce(current_setting('otr.universal.finite_pdf_unknown',true),'')<>''
 AND public.trip_source_finite_native_pdf_unknown(
 ((current_setting('otr.universal.finite_pdf_unknown',true)::jsonb)->>'attemptId')::uuid,
 ((current_setting('otr.universal.finite_pdf_unknown',true)::jsonb)->>'ownerRun')::uuid,
 ((current_setting('otr.universal.finite_pdf_unknown',true)::jsonb)->>'ownerFence')::bigint) IS TRUE THEN
  IF tg_op<>'UPDATE' THEN RAISE EXCEPTION 'PDF_UNKNOWN_ONLY';END IF;
  IF tg_level='STATEMENT' THEN RETURN NULL;END IF;
  IF old.id::text IS DISTINCT FROM (current_setting('otr.universal.finite_pdf_unknown',true)::jsonb)->>'operationId'
  OR old.phase IS DISTINCT FROM 'IO_ACTIVE' OR new.phase IS DISTINCT FROM 'IO_UNKNOWN'
  OR old.io_finished_at IS NOT NULL OR new.io_finished_at IS NOT NULL
  OR (to_jsonb(old)-ARRAY['phase','io_finished_at']) IS DISTINCT FROM (to_jsonb(new)-ARRAY['phase','io_finished_at'])
  THEN RAISE EXCEPTION 'PDF_UNKNOWN_ONLY';END IF;
  RETURN new;
 END IF;
"""
        marker=" if public.trip_source_universal_original_pin()->>'access'='READ_RECEIPT'"
        return [(old,new),(marker,negative+marker)]
    if oid in ("66870", "66871"):
        old="OR actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid\n  OR trip IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid"
        new="OR NOT ((actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid) OR public.trip_source_finite_native_pdf_frame(actor,trip,source) IS TRUE)"
        return [(old,new),("public.trip_sustained_universal_pdf_allowed(actor,trip) IS NOT TRUE", "public.trip_sustained_universal_pdf_allowed(actor,trip) IS NOT TRUE AND public.trip_source_finite_native_pdf_frame(actor,trip,source) IS NOT TRUE")]
    if oid == "65994":
        return [("AS $function$declare a jsonb;begin", "AS $function$declare a jsonb;begin\n IF (q->>'actor_account_id' IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543' OR q->>'trip_id' IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a') AND public.trip_source_finite_native_command((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid,q::text) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_PDF_SOURCE_CLOSED';END IF;")]
    if oid == "66030":
        return [("perform public.trip_source_pdf_registration_gate();", "IF (actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid OR trip IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid) AND public.trip_source_finite_native_pdf_request(actor,trip,q) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_PDF_SOURCE_CLOSED';END IF;\n perform public.trip_source_pdf_registration_gate();")]
    if oid == "66021":
        old=" if actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid OR trip IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid then perform public.trip_source_pdf_upload_v4_source(actor,trip,source);end if;\n"
        return [(old, "")]
    if oid == "66035":
        return [("begin\n if public.trip_source_sustained_run_row", "begin\n IF public.trip_source_finite_native_run_row(tab,op,n) THEN RETURN;END IF;\n if public.trip_source_sustained_run_row")]
    if oid == "58229":
        start=definition.index(" if png_p->>'profile'='OTR_PNG_CAPTURE_ORIGINAL_V1'")
        split=definition.index(' png_s:=public.trip_source_png_scope();',start)
        end=definition.index(' declare b jsonb;begin',split)
        first=definition[start:split]
        second=definition[split:end]
        revised_first=first.replace("'f4b059c5-8241-4ffb-aa15-37fa25474543'", "(png_p->>'actor')").replace("'825f79b2-4a9d-4535-a62e-43000ca50c4a'", "(png_p->>'trip')").replace("'v1/825f79b2-4a9d-4535-a62e-43000ca50c4a/'", "'v1/'||(png_p->>'trip')||'/'")
        revised_second=second.replace("'f4b059c5-8241-4ffb-aa15-37fa25474543'", "(png_s->>'actor')").replace("'825f79b2-4a9d-4535-a62e-43000ca50c4a'", "(png_s->>'trip')")
        return [(first,revised_first),(second,revised_second)]
    if oid == "67150":
        return [
            ("generation bigint;", "generation bigint;finite boolean;legacy boolean;"),
            ("actor is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid", "actor IS NULL"),
            ("q:=public.trip_source_command_codec(raw);", """q:=public.trip_source_command_codec(raw);
 legacy:=actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND q->>'trip_id'='825f79b2-4a9d-4535-a62e-43000ca50c4a';
 finite:=public.trip_source_finite_native_command(actor,(q->>'trip_id')::uuid,raw);
 IF NOT legacy AND NOT finite THEN
  IF access IS DISTINCT FROM 'READ_RECEIPT' OR public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,(q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256') IS NULL
  THEN RAISE EXCEPTION 'PNG_SCOPE_CLOSED';END IF;
 END IF;"""),
            (" or q->>'trip_id' is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'", ""),
            ("actor,'825f79b2-4a9d-4535-a62e-43000ca50c4a',access='WRITE'", "actor,(q->>'trip_id')::uuid,access='WRITE'"),
            ("not public.trip_sustained_universal_png_allowed(actor,'825f79b2-4a9d-4535-a62e-43000ca50c4a')", "NOT finite AND NOT (legacy AND public.trip_sustained_universal_png_allowed(actor,(q->>'trip_id')::uuid))"),
            ("s.trip_id is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid", "s.trip_id is distinct from (q->>'trip_id')::uuid"),
        ]
    if oid == "67156":
        return [
            ("active boolean;", "active boolean;legacy boolean;"),
            ("actor is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid", "actor IS NULL"),
            ("o.trip_id is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid", "o.trip_id is distinct from (q->>'trip_id')::uuid"),
            ("active:=public.trip_sustained_universal_png_allowed(actor,o.trip_id);", """legacy:=actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND o.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid;
 IF NOT legacy AND public.trip_source_finite_native_png_execution_allowed(actor,raw,false) IS NOT TRUE THEN RAISE EXCEPTION 'PNG_EXEC_DENIED';END IF;
 active:=(legacy AND public.trip_sustained_universal_png_allowed(actor,o.trip_id)) OR public.trip_source_finite_native_png_execution_allowed(actor,raw,true);"""),
            ("if not active and a.phase not in ('UNKNOWN','TERMINAL') then", "if not active and (NOT legacy OR a.phase not in ('UNKNOWN','TERMINAL')) then"),
        ]
    if oid == "67161":
        return [
            ("actor is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid", "actor IS NULL"),
            (" or q->>'trip_id' is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'", ""),
            ("ctx:=public.trip_source_png_enter(actor,raw,scope_access);", """IF (actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid OR q->>'trip_id' IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a') THEN
  IF action IN ('EXEC_REGISTER','EXEC_CLAIM','EXEC_ATTACH') OR action='EXEC_ADVANCE' AND proof->>'nextPhase'='RUNNING' THEN scope_access:='WRITE';END IF;
  IF action IN ('REGISTER','BEGIN') AND o.phase IN ('IO_UNKNOWN','IO_ACTIVE','IO_QUIESCENT') THEN RAISE EXCEPTION 'PNG_EXACT_RECOVERY_REQUIRED';END IF;
 END IF;
 ctx:=public.trip_source_png_enter(actor,raw,scope_access);"""),
        ]
    if oid == "66243":
        return [("begin\n begin png_p:=", "begin\n IF public.trip_source_finite_native_original_pin() IS NOT NULL THEN RETURN public.trip_source_finite_native_original_pin();END IF;\n begin png_p:=")]
    if oid == "66255":
        return [("begin\n png_q:=raw::jsonb;", "begin\n IF public.trip_source_finite_native_original_context(actor,raw) IS NOT NULL THEN RETURN public.trip_source_acquire_finite_original(actor,raw);END IF;\n png_q:=raw::jsonb;")]
    if oid == "66263":
        return [("begin\n png_q:=raw::jsonb;", """begin
 png_q:=raw::jsonb;
 IF actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid OR png_q->>'trip_id' IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a' THEN
  IF current_user<>'otr_trip_source_writer' OR session_user<>'otr_trip_source_command_gateway' THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
  png_q:=public.trip_source_command_codec(raw);
  IF png_q->>'command' IS DISTINCT FROM 'ACQUIRE_SOURCE' OR png_q->>'actor_account_id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
  png_result:=public.trip_source_operation_lookup(actor,(png_q->>'trip_id')::uuid,(png_q->>'source_id')::uuid,(png_q->>'operation_id')::uuid,png_q->>'operation_key',png_q->>'operation_sha256');
  IF png_result IS NULL AND public.trip_source_finite_native_command(actor,(png_q->>'trip_id')::uuid,raw) IS NOT TRUE THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_SCOPE_CLOSED';END IF;
  RETURN png_result;
 END IF;""")]
    if oid == "66232":
        gates = re.findall(r"if not public\.trip_sustained_universal_allowed\(actor,trip\) and not exists\(select 1 from public\.trip_source_universal_scope .*?then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;", definition, re.S)
        if len(gates) != 2:
            raise ValueError("EXPECTED_TWO_BEGIN_GATES")
        new = "if not public.trip_sustained_universal_allowed(actor,trip) and public.trip_source_finite_native_normalized_scope(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs') IS NOT TRUE then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;"
        return [(g, new) for g in gates]
    if oid == "66234":
        return [
            ("if (select count(*) from public.trip_source_inputs where run_id=r.id)<>1 then", "if (select count(*) from public.trip_source_inputs where run_id=r.id)<>1 and public.trip_source_finite_native_retained_pin(actor,trip,p) IS NOT TRUE then"),
            ("IF actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid AND rep.role='DERIVED'", "IF (actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid OR public.trip_source_finite_native_retained_pin(actor,trip,p) IS TRUE) AND rep.role='DERIVED'"),
        ]
    if oid == "66872":
        gate = re.search(r" IF actor IS DISTINCT FROM 'f4b059c5.*?THEN RAISE EXCEPTION 'UNIVERSAL_PDF_SOURCE_CLOSED';END IF;", definition, re.S)
        if not gate:
            raise ValueError("EXPECTED_PDF_GATE")
        return [
            (gate[0], " IF writing IS NULL OR normalize_original IS NULL OR NOT (\n (actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid\n AND public.trip_sustained_universal_allowed(actor,trip) IS TRUE\n AND (NOT writing OR public.trip_sustained_universal_pdf_allowed(actor,trip) IS TRUE))\n OR public.trip_source_finite_native_material(actor,trip,pin,writing) IS TRUE)\n THEN RAISE EXCEPTION 'UNIVERSAL_PDF_SOURCE_CLOSED';END IF;"),
            ("THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;", "AND NOT (public.trip_source_finite_native_material(actor,trip,pin,false) IS TRUE\n AND NOT EXISTS(SELECT 1 FROM public.trip_source_runs existing WHERE existing.id=pin.run_id))\n THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;"),
        ]
    if oid == "67145":
        return [
            ("if actor is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid or trip is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid or material is distinct from 1::bigint then", "if (actor is distinct from 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid or trip is distinct from '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid or material is distinct from 1::bigint) and public.trip_source_finite_native_png_material(actor,trip,source,representation,material) IS NOT TRUE then"),
        ]
    raise ValueError("UNEXPECTED_FUNCTION")


def function_identity(definition):
    match = re.search(r"FUNCTION (public\.[a-z_0-9]+)\((.*?)\)\n RETURNS", definition, re.S)
    if not match:
        raise ValueError("PINNED_FUNCTION_IDENTITY_REJECTED")
    types = []
    for argument in match[2].split(",") if match[2] else []:
        parts = argument.split(" DEFAULT ", 1)[0].strip().split()
        if len(parts) != 2 or parts[1] not in {"uuid", "text", "bigint", "boolean", "jsonb", "trip_source_inputs", "trip_source_operations"}:
            raise ValueError("PINNED_ARGUMENT_TYPE_REJECTED")
        types.append("public." + parts[1] if parts[1].startswith("trip_source_") else parts[1])
    return match[1] + "(" + ",".join(types) + ")"


def build(directory):
    output = ["-- DEFINITIONS-ONLY CANDIDATE: not a complete installation/ownership envelope.\n-- All existing Source proof, seal, input validity and canonical hash bodies retained."]
    for oid, digest in PINS.items():
        definition = (directory / f"function-{oid}.private.sql").read_text()
        if hashlib.sha256(definition.encode()).hexdigest() != digest:
            raise ValueError(f"PREIMAGE_SHA_REJECTED_{oid}")
        body = re.search(r"AS \$function\$(.*?)\$function\$", definition, re.S)[1]
        identity = function_identity(definition)
        patches = changes(oid, definition)
        transformed = definition
        for old, new in patches:
            if transformed.count(old) != 1:
                raise ValueError(f"PATCH_MATCH_COUNT_REJECTED_{oid}")
            transformed = transformed.replace(old, new)
        md5 = hashlib.md5(body.encode()).hexdigest()
        lines = [f"DO $patch$ DECLARE p oid;definition text;BEGIN\n p:=to_regprocedure('{identity}');\n IF p IS NULL THEN RAISE EXCEPTION 'FINITE_PROOF_FUNCTION_MISSING_{oid}';END IF;\n IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=p)<>'{md5}' THEN RAISE EXCEPTION 'FINITE_PROOF_PREIMAGE_{oid}';END IF;\n definition:=pg_get_functiondef(p);"]
        for index, (old, new) in enumerate(patches):
            tag = f"$delta_{oid}_{index}$"
            if tag in old or tag in new:
                raise ValueError("PATCH_DELIMITER_COLLISION")
            lines.append(f" IF (length(definition)-length(replace(definition,{tag}{old}{tag},'')))/length({tag}{old}{tag})<>1 THEN RAISE EXCEPTION 'FINITE_PROOF_MATCH_{oid}_{index}';END IF;\n definition:=replace(definition,{tag}{old}{tag},{tag}{new}{tag});")
        lines.append(" EXECUTE definition;END $patch$;")
        output.append("\n".join(lines))
    return "\n\n".join(output) + "\n"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_finite_native_proof_candidate.py PRIVATE_PREIMAGES OUTPUT_SQL")
    Path(sys.argv[2]).write_text(build(Path(sys.argv[1])))
