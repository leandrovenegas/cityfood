import re

with open('Z:/proyects/cityfood/app/page_backup.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Imports
content = re.sub(
    r""import { db, auth, signInAnonymously } from '\./firebase';\nimport { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc, limit, startAfter, getDocs, getCountFromServer, where } from "firebase/firestore";"",
    ""import { supabase } from './supabase';"",
    content
)

# 1. Auth
content = re.sub(
    r""// 1\. Auth\s*useEffect\(\(\) => \{\s*signInAnonymously.*?\}, \[\]\);"",
    ""// 1. Auth\n  useEffect(() => {\n    setUserId('default-user');\n    setLoading(false);\n  }, []);"",
    content, flags=re.DOTALL
)

# 2. Fetch Scans
content = re.sub(
    r""// 2\. Fetch Scans\s*useEffect\(\(\) => \{.*?\}, \[userId\]\);"",
    ""// 2. Fetch Scans\n  useEffect(() => {\n    setScans([]);\n  }, [userId]);"",
    content, flags=re.DOTALL
)

# 3. Fetch Jobs
content = re.sub(
    r""// 3\. Fetch Jobs\s*useEffect\(\(\) => \{.*?\}, \[userId\]\);"",
    ""// 3. Fetch Jobs\n  useEffect(() => {\n    if (!userId) return;\n    const fetchJobs = async () => {\n      const { data } = await supabase.from('global_job_queue').select('*').order('last_run', { ascending: false }).limit(50);\n      if (data) setJobs(data);\n    };\n    fetchJobs();\n    const channel = supabase.channel('jobs_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'global_job_queue' }, fetchJobs).subscribe();\n    return () => supabase.removeChannel(channel);\n  }, [userId]);"",
    content, flags=re.DOTALL
)

# 4. Fetch Global Businesses
content = re.sub(
    r""// 4\. Fetch Global Businesses & Stats\s*useEffect\(\(\) => \{.*?\}, \[userId, selectedSource\]\);"",
    ""// 4. Fetch Global Businesses & Stats\n  useEffect(() => {\n    if (!userId) return;\n    const collName = selectedSource === 'gmaps' ? 'global_businesses' : 'amarillas_businesses';\n    const fetchCounts = async () => {\n      try {\n        const { count: globalCount } = await supabase.from(collName).select('*', { count: 'exact', head: true });\n        setTotalGlobalBusinesses(globalCount || 0);\n        const { count: pendingCount } = await supabase.from(collName).select('*', { count: 'exact', head: true }).eq('status', 'pending');\n        setTotalPending(pendingCount || 0);\n      } catch (e) {}\n    };\n    fetchCounts();\n    const fetchBusinesses = async () => {\n      const { data } = await supabase.from(collName).select('*').eq('status', 'pending').order('needScore', { ascending: false }).limit(30);\n      if (data) {\n        setGlobalBusinesses(data);\n        setLastVisible(30);\n      }\n    };\n    fetchBusinesses();\n    const channel = supabase.channel('biz_changes').on('postgres_changes', { event: '*', schema: 'public', table: collName }, () => {\n      fetchBusinesses(); fetchCounts();\n    }).subscribe();\n    return () => supabase.removeChannel(channel);\n  }, [userId, selectedSource]);"",
    content, flags=re.DOTALL
)

# Load More
content = re.sub(
    r""const handleLoadMore = async \(\) => \{.*?finally \{\s*setLoadingMore\(false\);\s*\}\s*\};"",
    ""const handleLoadMore = async () => {\n    if (!lastVisible) return;\n    setLoadingMore(true);\n    const collName = selectedSource === 'gmaps' ? 'global_businesses' : 'amarillas_businesses';\n    try {\n      const { data } = await supabase.from(collName).select('*').eq('status', 'pending').order('needScore', { ascending: false }).range(lastVisible, lastVisible + 29);\n      if (data && data.length > 0) {\n        setGlobalBusinesses(prev => [...prev, ...data]);\n        setLastVisible(prev => prev + 30);\n      } else {\n        setLastVisible(null);\n      }\n    } catch (e) {\n      console.error('Error cargando más:', e);\n    } finally {\n      setLoadingMore(false);\n    }\n  };"",
    content, flags=re.DOTALL
)

# 5. Fetch CRM Leads
content = re.sub(
    r""// 5\. Fetch CRM Leads\s*useEffect\(\(\) => \{.*?\}, \[userId\]\);"",
    ""// 5. Fetch CRM Leads\n  useEffect(() => {\n    if (!userId) return;\n    const fetchLeads = async () => {\n      const { data } = await supabase.from('crm_leads').select('*').order('created_at', { ascending: false });\n      if (data) setCrmLeads(data);\n    };\n    fetchLeads();\n    const channel = supabase.channel('crm_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'crm_leads' }, fetchLeads).subscribe();\n    return () => supabase.removeChannel(channel);\n  }, [userId]);"",
    content, flags=re.DOTALL
)

# handleDeletePlace
content = re.sub(
    r""const handleDeletePlace = async \(scanId, placeName\) => \{.*?updateDoc.*?\}\);\s*\};"",
    ""const handleDeletePlace = async (scanId, placeName) => {};"",
    content, flags=re.DOTALL
)

# handleSetStatus
content = re.sub(
    r""const handleSetStatus = async \(place, newStatus\) => \{.*?setDoc.*?\}\);\s*\}\s*\}\s*\};"",
    ""const handleSetStatus = async (place, newStatus) => {\n    if (!userId) return;\n    const collName = selectedSource === 'gmaps' ? 'global_businesses' : 'amarillas_businesses';\n    if (place.id) {\n       await supabase.from(collName).update({ status: newStatus }).eq('id', place.id);\n    }\n    if (newStatus === 'crm') {\n      const exists = crmLeads.find(lead => lead.name === place.name);\n      if (!exists) {\n        await supabase.from('crm_leads').insert({\n          id: place.id,\n          name: place.name,\n          phone: place.phone || '',\n          url: place.url || '',\n          status: 'Prospecto',\n          notes: '',\n          created_at: new Date().toISOString()\n        });\n      }\n    }\n  };"",
    content, flags=re.DOTALL
)

# handleSubmit (form submit for new job)
content = re.sub(
    r""const handleSubmit = async \(e\) => \{.*?addDoc\(collection\(db, rtifacts/\$\{APP_ID\}/users/\$\{userId\}/scan_jobs\).*?setSubmitting\(false\);\s*\}\s*\};"",
    ""const handleSubmit = async (e) => {\n    e.preventDefault();\n    setSubmitting(true);\n    try {\n      await supabase.from('global_job_queue').insert({\n        category: formConfig.rubro,\n        location: formConfig.ciudad,\n        status: 'pending',\n        attempts: 0,\n        created_at: new Date().toISOString()\n      });\n      setSubmitSuccess(true);\n      setTimeout(() => setSubmitSuccess(false), 3000);\n    } catch (err) {\n      console.error(err);\n    } finally {\n      setSubmitting(false);\n    }\n  };"",
    content, flags=re.DOTALL
)

# handleAddLead
content = re.sub(
    r""const handleAddLead = async \(\) => \{.*?addDoc\(collection\(db, rtifacts/\$\{APP_ID\}/users/\$\{userId\}/crm_leads\).*?setShowAddLeadModal\(false\);\s*\}\s*\};"",
    ""const handleAddLead = async () => {\n    if (!newLeadData.name) return;\n    try {\n      await supabase.from('crm_leads').insert({\n        name: newLeadData.name,\n        phone: newLeadData.phone,\n        url: newLeadData.website,\n        status: 'Prospecto',\n        notes: '',\n        created_at: new Date().toISOString()\n      });\n      setNewLeadData({ name: '', phone: '', website: '' });\n      setShowAddLeadModal(false);\n    } catch (e) {\n      console.error(e);\n    }\n  };"",
    content, flags=re.DOTALL
)

with open('Z:/proyects/cityfood/app/page.js', 'w', encoding='utf-8') as f:
    f.write(content)
