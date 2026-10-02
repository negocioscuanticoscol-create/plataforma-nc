# -*- coding: utf-8 -*-
"""
Alerta de TRM (dólar): una vez cada mañana revisa la Tasa Representativa del
Mercado oficial (Banco de la República, vía datos.gov.co) y avisa por
Telegram cuando está en $3.370 o por debajo.

José, 2-oct-2026: la pidió al bajar el presupuesto de Construcción a $3.480,
que ya no alcanzaba el dólar de ese día -o sea que la plata del tope diario
no cubría ni un dólar-. Quiere saber cuando vuelva a estar así de bajo.

Fuente: https://www.datos.gov.co/resource/32sa-8pi3.json (dataset oficial de
la Superfinanciera/Banco de la República, el mismo que usan los bancos).

Si el valor de hoy es <= UMBRAL, manda UN aviso a Telegram. Si está por
encima, no manda nada -el silencio es "sigue por encima". Mismo bot y chat
que sofia-vigia y el resumen.

Variables: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, UMBRAL (default 3370).
Para probar sin avisar: SOLO_IMPRIMIR=1.
"""
import os, json, urllib.request

UMBRAL = float(os.environ.get('UMBRAL', '3370'))
TG_TOKEN = os.environ.get('TELEGRAM_TOKEN', '')
TG_CHAT = os.environ.get('TELEGRAM_CHAT_ID', '')
SOLO = os.environ.get('SOLO_IMPRIMIR', '0') == '1'

FUENTE = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1'


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
    with urllib.request.urlopen(FUENTE, timeout=30) as r:
        fila = json.load(r)[0]
    trm = float(fila['valor'])
    fecha = fila['vigenciadesde'][:10]
    print(f'TRM {fecha}: ${trm:,.2f}')

    if trm <= UMBRAL:
        avisar(f"💵 Dólar en ${trm:,.2f} ({fecha}) — ya está en o por debajo de ${UMBRAL:,.0f}.")
    else:
        print(f'Por encima de ${UMBRAL:,.0f}, no se avisa.')


if __name__ == '__main__':
    main()
