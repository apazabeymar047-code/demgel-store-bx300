"""
VERIFICACIÓN DE INTEGRIDAD FRONTEND
Fase 2C: Comprueba existencia de archivos, enlaces CSS/JS e imágenes de producto.
"""

import os
import re

BASE_DIR = r"c:\Users\Administrator\Desktop\WEB DEMGEL BX 300"

def verify_frontend():
    print("==================================================================")
    print("VERIFICACIÓN DE INTEGRIDAD DE ARCHIVOS Y ENLACES (FASE 2C)")
    print("==================================================================")
    
    errors = []

    # 1. Comprobar existencia de HTMLs principales
    html_files = ["index.html"]
    for h in html_files:
        path = os.path.join(BASE_DIR, h)
        if not os.path.exists(path):
            errors.append(f"Falta archivo: {h}")
        else:
            print(f"[OK] {h} presente ({os.path.getsize(path)} bytes)")

    # 2. Comprobar JS y CSS
    expected_assets = [
        "css/style.css",
        "js/data.js",
        "js/analytics.js",
        "js/cart.js",
        "js/app.js"
    ]
    for asset in expected_assets:
        path = os.path.join(BASE_DIR, asset)
        if not os.path.exists(path):
            errors.append(f"Falta asset: {asset}")
        else:
            print(f"[OK] {asset} presente ({os.path.getsize(path)} bytes)")

    # 3. Comprobar que las imágenes referenciadas en data.js existan físicamente
    data_js_path = os.path.join(BASE_DIR, "js", "data.js")
    with open(data_js_path, "r", encoding="utf-8") as f:
        data_content = f.read()

    images_referenced = re.findall(r'"(assets/products/[^"]+)"', data_content)
    print(f"\nVerificando {len(images_referenced)} referencias de imágenes...")
    for img_rel in set(images_referenced):
        full_img_path = os.path.join(BASE_DIR, img_rel.replace("/", "\\"))
        if not os.path.exists(full_img_path):
            errors.append(f"Imagen referenciada no existe: {img_rel}")
        else:
            print(f"[OK] Imagen presente: {img_rel}")

    # 4. Comprobar sintaxis básica de los scripts en HTML
    for h in html_files:
        with open(os.path.join(BASE_DIR, h), "r", encoding="utf-8") as f:
            content = f.read()
            for asset in ["css/style.css", "js/data.js", "js/analytics.js", "js/cart.js", "js/app.js"]:
                if asset not in content:
                    errors.append(f"El archivo {h} no enlaza {asset}")

    print("==================================================================")
    if errors:
        print(f"ERRORES ENCONTRADOS ({len(errors)}):")
        for e in errors:
            print(f" - {e}")
        return False
    else:
        print("RESULTADO: 100% DE ARCHIVOS, ENLACES E IMÁGENES VALIDADOS.")
        print("==================================================================")
        return True

if __name__ == "__main__":
    success = verify_frontend()
    exit(0 if success else 1)
