const puppeteer = require('/tmp/npm/node_modules/puppeteer-extra');
const StealthPlugin = require('/tmp/npm/node_modules/puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Función para leer el archivo JSON de datos
function leerDatos() {
	try {
		const datos = fs.readFileSync(`./datos.json`, 'utf8');
		return JSON.parse(datos);
	} catch (error) {
		console.error('Error al leer datos.json:', error);
		process.exit(1);
	}
}

// Función para guardar los datos actualizados en el archivo JSON
function guardarDatos(datos) {
	fs.writeFileSync(`./datos.json`, JSON.stringify(datos, null, 2));
	console.log('Datos actualizados en datos.json');
}

async function obtenerNuevoDominio(browser, dominioBase) {
	try {
		// Crear una nueva página
		const page = await browser.newPage();

		// Ir a la URL base
		await page.goto(dominioBase, {
			waitUntil: 'networkidle0'
		});

		// Esperar a que el botón esté disponible y hacer clic
		const buttonSelector = "//div[contains(text(), 'Nuevo dominio')]";
		await page.waitForSelector(`xpath/${buttonSelector}`);

		// Hacer clic en el botón
		const element = await page.$(`xpath/${buttonSelector}`);
		await element.click();

		// Esperar a que se abra la nueva pestaña
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Obtener todas las páginas
		const pages = await browser.pages();
		// La última página abierta será la nueva
		const newPage = pages[pages.length - 1];

		// Obtener la URL de la nueva página
		const nuevoDominio = newPage.url();
		console.log('Nuevo dominio obtenido:', nuevoDominio);

		// Cerrar la página original
		await page.close();

		return { nuevoDominio, newPage };
	} catch (error) {
		console.error('Error al obtener nuevo dominio:', error);
		throw error;
	}
}

async function obtenerCapitulos(page, urlCompleta) {
	// Ir a la URL completa y esperar que se cargue completamente
	await page.goto(urlCompleta, { waitUntil: 'networkidle0' });

	// Esperar y obtener el número de capítulos
	const capitulosSelector = 'h2.font-semibold.text-2xl';
	await page.waitForSelector(capitulosSelector, { timeout: 10000 }); // Se espera hasta 10 segundos

	// Intentar obtener los capítulos desde la página
	const capitulos = await page.evaluate((selector) => {
		const elemento = document.querySelector(selector);
		if (!elemento) {
			console.warn('Elemento no encontrado');
			return '';
		}
		// Extraer y procesar el contenido del texto
		const texto = elemento.textContent;
		const match = texto.match(/(\d+)/);
		return match ? match[1] : '';
	}, capitulosSelector);

	return capitulos;
}

async function main() {
	let browser;
	try {
		const datos = leerDatos();

		// Lanzar navegador
		browser = await puppeteer.launch({
			headless: true,
			args: ['--no-sandbox'],
			defaultViewport: null
		});

		// Obtener nuevo dominio
		const { nuevoDominio } = await obtenerNuevoDominio(browser, datos.dominio_base);

		// Procesar cada ficha
		for (const ficha of datos.fichas) {
			console.log(`\nProcesando ficha: ${ficha.ruta_ficha}`);

			// Construir URL completa
			// Eliminar barra final del dominio si existe
			const dominioLimpio = nuevoDominio.replace(/\/+$/, '');
			// Asegurar que la ruta_ficha tenga el formato correcto
			const rutaFichaLimpia = ficha.ruta_ficha.startsWith('/') ? ficha.ruta_ficha : '/' + ficha.ruta_ficha;
			const urlCompleta = dominioLimpio + rutaFichaLimpia;
			ficha.url_completa = urlCompleta;

			// Abrir una nueva pestaña para cada ficha
			const paginaFicha = await browser.newPage();
			try {
				// Intentar obtener los capítulos; si falla, no actualizar ficha.capitulos
				const capitulos = await obtenerCapitulos(paginaFicha, urlCompleta);
				console.log(`URL completa: ${urlCompleta}`);
				console.log(`Capítulos: ${capitulos}`);
				ficha.capitulos = capitulos;
			} catch (error) {
				// Si ocurre un error (por ejemplo, timeout), se registra y se mantiene el valor anterior de ficha.capitulos
				console.error(`Error al obtener capítulos para ${urlCompleta}:`, error);
				console.log(`URL completa: ${urlCompleta}`);
				console.log(`Capítulos: ${ficha.capitulos} (sin actualizar)`);
			} finally {
				// Cerrar la pestaña de la ficha después de procesarla
				await paginaFicha.close();
			}

			// Esperar entre solicitudes (en milisegundos)
			await new Promise(resolve => setTimeout(resolve, 20000));
		}

		// Guardar los datos actualizados
		guardarDatos(datos);

	} catch (error) {
		console.error('Error durante el scraping:', error);
		throw error;
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}

// Maneja el error a nivel superior
main().catch(error => {
	console.error('Error fatal en la aplicación:', error);
	process.exit(1);
});


// Copia del workflow de gitub
// .github/workflows/ejecutar_script.yml

// name: Ejecutar script
//
// on:
//   schedule:
//     - cron: '0 0 * * *'
//   workflow_dispatch:
//
// jobs:
//   ejecutar_script:
//     runs-on: ubuntu-latest
//
//     steps:
//       - name: Clonar repositorio
//         uses: actions/checkout@v4
//
//       - name: Configurar Node.js
//         uses: actions/setup-node@v4
//
//       - name: Instalar dependencias
//         run: |
//           npm install --prefix "/tmp/npm" puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
//
//       - name: Configurar git
//         run: |
//           git config --global user.name "github-actions"
//           git config --global user.email "actions@github.com"
//
//       - name: Ejecutar script
//         run: |
//           node ./mango_scraping.js
//
//       - name: Subir cambios
//         run: |
//           git add -A
//           git commit -m "Actualizado" || echo "Sin cambios"
//           git pull origin main --rebase
//           git push origin main


// datos.json

// {
//   "notas": [
//     "Solo es necesario pegar la ruta_ficha de cada ficha desde el dominio, las barras antes y después no importan, pero el resto debe ser exacto.",
//     "Cuidado con la sintaxis: las comas son necesarias después de cada línea EXCEPTO la última de cada sección.",
//     "Ejemplo: 'ruta_ficha' y 'capitulos' necesitan coma, pero 'url_completa' no. La última ficha no necesita coma después del }"
//   ],
//   "dominio_base": "",
//   "fichas": [
//     {
//       "ruta_ficha": "",
//       "capitulos": "",
//       "url_completa": ""
//     },
//     {
//       "ruta_ficha": "",
//       "capitulos": "",
//       "url_completa": ""
//     }
//   ]
// }
