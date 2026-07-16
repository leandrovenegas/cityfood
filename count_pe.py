#!/usr/bin/env python3
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()
db = create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
r = db.table('amarillas_businesses').select('id', count='exact').eq('country', 'pe').execute()
print('PE en Supabase:', r.count)
