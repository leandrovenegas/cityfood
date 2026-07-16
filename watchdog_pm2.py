import time
import subprocess
import json
import os
import datetime

PROCESS_NAME = "cityfood-spider"
MAX_SILENCE_SECONDS = 300  # 5 minutos de silencio máximo antes de asumir atasco
MAX_LOG_GROWTH_PER_MINUTE = 5 * 1024 * 1024  # 5 MB por minuto (detección de loop infinito de logs)

def run_cmd(cmd):
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return res.stdout.strip()
    except Exception as e:
        print(f"Error ejecutando comando '{cmd}': {e}", flush=True)
        return ""

def log_msg(msg):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] [VIGILANTE] {msg}", flush=True)

def restart_spider():
    log_msg("Iniciando secuencia de reinicio del spider...")
    # Detener el proceso en PM2
    run_cmd(f"pm2 stop {PROCESS_NAME}")
    
    # Limpiar cualquier proceso huérfano de Chromium/Chrome para liberar RAM y evitar bloqueos
    log_msg("Limpiando procesos huérfanos de Chromium en el servidor...")
    run_cmd("pkill -u lv -f chromium")
    run_cmd("pkill -u lv -f chrome")
    
    time.sleep(2)
    
    # Volver a iniciar el proceso
    run_cmd(f"pm2 start {PROCESS_NAME}")
    log_msg("Spider reiniciado exitosamente.")

log_msg("Iniciando Vigilante del Spider en PM2...")

prev_out_size = None
prev_err_size = None
heartbeat_counter = 0

while True:
    try:
        jlist_out = run_cmd("pm2 jlist")
        if not jlist_out:
            log_msg("Advertencia: 'pm2 jlist' retornó salida vacía.")
            time.sleep(60)
            continue
            
        # Intentar parsear el JSON
        try:
            processes = json.loads(jlist_out)
        except Exception:
            # PM2 a veces imprime advertencias no JSON al inicio, limpiar y re-intentar
            start_idx = jlist_out.find('[')
            if start_idx != -1:
                try:
                    processes = json.loads(jlist_out[start_idx:])
                except:
                    log_msg("Error: Falló el parseo de JSON de 'pm2 jlist'.")
                    time.sleep(60)
                    continue
            else:
                log_msg("Error: No se encontró estructura de lista JSON en 'pm2 jlist'.")
                time.sleep(60)
                continue
                
        spider_proc = None
        for proc in processes:
            if proc.get("name") == PROCESS_NAME:
                spider_proc = proc
                break
                
        if not spider_proc:
            log_msg(f"Proceso '{PROCESS_NAME}' no registrado en PM2. Registrando e iniciando...")
            run_cmd("pm2 start /home/lv/proyects/cityfood/venv/bin/python --name 'cityfood-spider' --cwd /home/lv/proyects/cityfood -- -u spider_global.py")
            run_cmd("pm2 save")
            prev_out_size = None
            prev_err_size = None
            time.sleep(60)
            continue
            
        pm2_env = spider_proc.get("pm2_env", {})
        status = pm2_env.get("status")
        pm_id = spider_proc.get("pm_id")
        
        # Incrementar contador para heartbeat
        heartbeat_counter += 1
        
        if status != "online":
            log_msg(f"¡ALERTA! El estado del spider '{PROCESS_NAME}' es '{status}' (debería ser 'online'). Reiniciando...")
            restart_spider()
            prev_out_size = None
            prev_err_size = None
        else:
            # El proceso está online, verificar actividad por logs
            out_log_path = pm2_env.get("pm_out_log_path")
            err_log_path = pm2_env.get("pm_err_log_path")
            
            latest_mtime = 0
            out_size = 0
            err_size = 0
            
            # Obtener datos de log de salida
            if out_log_path and os.path.exists(out_log_path):
                latest_mtime = max(latest_mtime, os.path.getmtime(out_log_path))
                out_size = os.path.getsize(out_log_path)
                
            # Obtener datos de log de errores
            if err_log_path and os.path.exists(err_log_path):
                latest_mtime = max(latest_mtime, os.path.getmtime(err_log_path))
                err_size = os.path.getsize(err_log_path)
                
            if latest_mtime > 0:
                elapsed = time.time() - latest_mtime
                
                # 1. Chequeo de Silencio (Spider colgado / congelado sin imprimir nada)
                if elapsed > MAX_SILENCE_SECONDS:
                    log_msg(f"¡ALERTA! El spider está 'online' pero lleva {elapsed:.1f}s en silencio (límite {MAX_SILENCE_SECONDS}s). Reiniciando por atasco...")
                    restart_spider()
                    prev_out_size = None
                    prev_err_size = None
                    time.sleep(60)
                    continue
                
                # 2. Chequeo de Crecimiento Explosivo (Spider en loop infinito escribiendo a lo loco)
                if prev_out_size is not None and prev_err_size is not None:
                    growth_out = max(0, out_size - prev_out_size)
                    growth_err = max(0, err_size - prev_err_size)
                    
                    if growth_out > MAX_LOG_GROWTH_PER_MINUTE or growth_err > MAX_LOG_GROWTH_PER_MINUTE:
                        log_msg(f"¡ALERTA! Crecimiento anormal de logs detectado. Salida: +{growth_out/1024/1024:.2f}MB, Error: +{growth_err/1024/1024:.2f}MB en 1 min. Posible loop infinito. Reiniciando...")
                        restart_spider()
                        prev_out_size = None
                        prev_err_size = None
                        time.sleep(60)
                        continue
                
                # Guardar tamaños para la próxima iteración
                prev_out_size = out_size
                prev_err_size = err_size
                
                # Heartbeat cada 15 checks (~15 minutos)
                if heartbeat_counter >= 15:
                    log_msg(f"Vigilante activo. Spider '{PROCESS_NAME}' saludable (online, última actividad hace {elapsed:.1f}s).")
                    heartbeat_counter = 0
            else:
                # Si no hay logs creados todavía
                pass
                
    except Exception as e:
        log_msg(f"Error en el bucle del vigilante: {e}")
        
    time.sleep(60)
