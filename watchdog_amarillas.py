import time
import subprocess
import json
import os
import datetime

COUNTRIES = ["cl", "pe"]
PROCESS_PREFIX = "cityfood-amarillas-"
MAX_SILENCE_SECONDS = 360  # 6 minutos de silencio máximo (el crawler escribe heartbeat cada 2 minutos en espera diaria)
MAX_LOG_GROWTH_PER_MINUTE = 5 * 1024 * 1024  # 5 MB por minuto

def run_cmd(cmd):
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return res.stdout.strip()
    except Exception as e:
        print(f"Error ejecutando comando '{cmd}': {e}", flush=True)
        return ""

def log_msg(msg):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] [VIGILANTE AMARILLAS] {msg}", flush=True)

def restart_spider(country):
    proc_name = f"{PROCESS_PREFIX}{country}"
    log_msg(f"Iniciando secuencia de reinicio para {proc_name}...")
    run_cmd(f"pm2 stop {proc_name}")
    
    # Limpiar procesos huérfanos de Chromium/Chrome
    log_msg(f"Limpiando procesos de Chrome en el servidor...")
    run_cmd("pkill -u lv -f chromium")
    run_cmd("pkill -u lv -f chrome")
    
    time.sleep(2)
    run_cmd(f"pm2 start {proc_name}")
    log_msg(f"Proceso {proc_name} reiniciado exitosamente.")

log_msg("Iniciando Vigilante de Páginas Amarillas en PM2...")

# Diccionario para almacenar tamaños previos de log por proceso
prev_sizes = {}
heartbeat_counter = 0

while True:
    try:
        jlist_out = run_cmd("pm2 jlist")
        if not jlist_out:
            log_msg("Advertencia: 'pm2 jlist' retornó salida vacía.")
            time.sleep(60)
            continue
            
        # Parsear JSON
        try:
            processes = json.loads(jlist_out)
        except Exception:
            start_idx = jlist_out.find('[')
            if start_idx != -1:
                try:
                    processes = json.loads(jlist_out[start_idx:])
                except:
                    log_msg("Error: Falló el parseo de JSON de 'pm2 jlist'.")
                    time.sleep(60)
                    continue
            else:
                log_msg("Error: No se encontró lista JSON en 'pm2 jlist'.")
                time.sleep(60)
                continue
                
        heartbeat_counter += 1
        
        for country in COUNTRIES:
            proc_name = f"{PROCESS_PREFIX}{country}"
            
            # Buscar el proceso en el listado de PM2
            proc_info = None
            for proc in processes:
                if proc.get("name") == proc_name:
                    proc_info = proc
                    break
                    
            if not proc_info:
                log_msg(f"Proceso '{proc_name}' no registrado en PM2. Registrando e iniciando...")
                run_cmd(f"pm2 start /home/lv/proyects/cityfood/venv/bin/python --name '{proc_name}' --cwd /home/lv/proyects/cityfood -- -u spider_amarillas.py --country {country}")
                run_cmd("pm2 save")
                prev_sizes[proc_name] = {"out": None, "err": None}
                continue
                
            pm2_env = proc_info.get("pm2_env", {})
            status = pm2_env.get("status")
            
            if status != "online":
                log_msg(f"¡ALERTA! El estado de '{proc_name}' es '{status}' (debería ser 'online'). Reiniciando...")
                restart_spider(country)
                prev_sizes[proc_name] = {"out": None, "err": None}
            else:
                # Proceso está online, verificar actividad
                out_log_path = pm2_env.get("pm_out_log_path")
                err_log_path = pm2_env.get("pm_err_log_path")
                
                latest_mtime = 0
                out_size = 0
                err_size = 0
                
                if out_log_path and os.path.exists(out_log_path):
                    latest_mtime = max(latest_mtime, os.path.getmtime(out_log_path))
                    out_size = os.path.getsize(out_log_path)
                    
                if err_log_path and os.path.exists(err_log_path):
                    latest_mtime = max(latest_mtime, os.path.getmtime(err_log_path))
                    err_size = os.path.getsize(err_log_path)
                    
                if latest_mtime > 0:
                    elapsed = time.time() - latest_mtime
                    
                    # 1. Silencio absoluto
                    if elapsed > MAX_SILENCE_SECONDS:
                        log_msg(f"¡ALERTA! El proceso '{proc_name}' lleva {elapsed:.1f}s en silencio (límite {MAX_SILENCE_SECONDS}s). Reiniciando...")
                        restart_spider(country)
                        prev_sizes[proc_name] = {"out": None, "err": None}
                        continue
                        
                    # 2. Crecimiento explosivo de logs
                    if proc_name not in prev_sizes:
                        prev_sizes[proc_name] = {"out": None, "err": None}
                        
                    prev_out = prev_sizes[proc_name]["out"]
                    prev_err = prev_sizes[proc_name]["err"]
                    
                    if prev_out is not None and prev_err is not None:
                        growth_out = max(0, out_size - prev_out)
                        growth_err = max(0, err_size - prev_err)
                        
                        if growth_out > MAX_LOG_GROWTH_PER_MINUTE or growth_err > MAX_LOG_GROWTH_PER_MINUTE:
                            log_msg(f"¡ALERTA! Crecimiento anormal de logs en '{proc_name}'. Salida: +{growth_out/1024/1024:.2f}MB, Error: +{growth_err/1024/1024:.2f}MB en 1 min. Posible loop. Reiniciando...")
                            restart_spider(country)
                            prev_sizes[proc_name] = {"out": None, "err": None}
                            continue
                            
                    prev_sizes[proc_name]["out"] = out_size
                    prev_sizes[proc_name]["err"] = err_size
                    
                    if heartbeat_counter >= 15:
                        log_msg(f"Vigilante activo. Proceso '{proc_name}' saludable (online, hace {elapsed:.1f}s activo).")
                        
        if heartbeat_counter >= 15:
            heartbeat_counter = 0
            
    except Exception as e:
        log_msg(f"Error en bucle del vigilante: {e}")
        
    time.sleep(60)
