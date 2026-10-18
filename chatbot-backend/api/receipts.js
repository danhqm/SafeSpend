import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createReceiptHandler } from "../lib/receipt-deletion.js";

export default createReceiptHandler({ db: supabaseAdmin, prepareResponse, requireUser, serverError });
