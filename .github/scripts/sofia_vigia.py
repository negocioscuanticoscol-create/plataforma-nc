# -*- coding: utf-8 -*-
"""
Vigía de Sofía: comprueba cada hora que n8n está arriba y que el flujo de
Sofía (FEROZ) está activo, sin dispararle una conversación.

Jose, 24-sep-2026: "apenas empecemos debe funcionar perfecto y aquí no
estamos garantizando eso". Esa noche n8n se cayó dos veces (una por la base,
otra por unas llaves internas) y nadie se enteró hasta que un cliente escribió.

Qué mira:
  1. GET https://n8n.../healthz  -> n8n vivo.
  2. GET https://n8n.../webhook/feroz -> 200 "OK" solo si el flujo de Sofía
     está ACTIVO (si está apagado n8n devuelve 404). Ese GET no lleva mensaje,
     así que Sofía no contesta nada ni gasta tokens.
  3. Que la respuesta llegue en menos de LIMITE_SEG segundos: Meta reenvía el
     mensaje si n8n tarda, y eso era lo que producía respuestas dobles.

Si algo falla, manda UN aviso a Telegram (mismo bot y chat del resumen) y el
job termina en error, para que también quede rojo en la pestaña Actions.
Si todo está bien no manda nada: el silencio es la señal de que va bien.

Variables: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID. Para probar sin avisar: SOLO_IMPRIMIR=1.
"""
import os, sys, json, time, urllib.request, urllib.error

BASE = os.environ.get('N8N_BASE', 'https://n8n-production-3d2ac.up.railway.app')
LIMITE_SEG = float(os.environ.get('LIMITE_SEG', '5'))
TG_TOKEN = os.environ.get('TELEGRAM_TOKEN', '')
TG_CHAT = os.environ.get('TELEGRAM_CHAT_ID', '')
SOLO = os.environ.get('SOLO_IMPRIMIR', '0') == '1'


def sonda(path, esperado=None):
    """Devuelve (ok, detalle, segundos). Reintenta una vez a los 20 s para no
    alarmar por un parpadeo de red."""
    for intento in (1, 2):
        t0 = time.time()
        try:
            with urllib.request.urlopen(BASE + path, timeout=30) as r:
                cuerpo = r.read(200).decode('utf-8', 'ignore')
                seg = time.time() - t0
                if esperado and esperado not in cuerpo:
                    return False, f"HTTP {r.status} pero el cuerpo fue «{cuerpo[:60]}»", seg
                if seg > LIMITE_SEG:
                    return False, f"respondió pero tardó {seg:.1f} s (límite {LIMITE_SEG:g} s)", seg
                return True, f"HTTP {r.status} en {seg:.2f} s", seg
        except urllib.error.HTTPError as e:
            det, seg = f"HTTP {e.code}", time.time() - t0
        except Exception as e:
            det, seg = f"sin respuesta: {str(e)[:80]}", time.time() - t0
        if intento == 1:
            time.sleep(20)
    return False, det, seg


def avisar(texto):
    print(texto)
    if SOLO or not TG_TOKEN or not TG_CHAT:
        print('(no se envió: SOLO_IMPRIMIR o faltan credenciales)')
        return
    data = json.dumps({'chat_id': TG_CHAT, 'text': texto, 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        print('telegram:', r.status)


def main():
    fallas = []
    ok, det, _ = sonda('/healthz', esperado='ok')
    print('n8n vivo:', ok, det)
    if not ok:
        fallas.append(f"• n8n no responde ({det})")
    else:
        ok2, det2, _ = sonda('/webhook/feroz', esperado='OK')
        print('flujo de Sofía activo:', ok2, det2)
        if not ok2:
            fallas.append(f"• el flujo de Sofía no contesta el webhook ({det2}). "
                          f"Si es HTTP 404, el flujo está apagado en n8n.")
    if fallas:
        avisar("🚨 Sofía · vigía\n" + "\n".join(fallas) +
               "\n\nQué hacer: abrir Railway → proyecto celebrated-joy → n8n → Deployments. "
               "Si está en rojo, Redeploy. Si n8n está bien, entrar a n8n y revisar que FEROZ_WF1 esté activo.")
        sys.exit(1)
    print('todo bien; no se avisa.')


if __name__ == '__main__':
    main()
