const fs = require('fs');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');

async function main() {
    let browser;
    try {
        console.log("1. Lancement du navigateur invisible...");
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });

        console.log("2. Ouverture de la page d'historique Revolut...");
        await page.goto('https://www.revolut.com/fr-FR/legal/terms/history/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log("3. Attente de l'apparition des liens PDF...");
        await page.waitForSelector('a[href*=".pdf"]', { timeout: 15000 });

        const pdfUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*=".pdf"]'));
            return links.length > 0 ? links[0].href : null;
        });

        if (!pdfUrl) throw new Error("Aucun lien PDF trouvé sur la page.");

        console.log("✅ Lien trouvé :", pdfUrl);
        console.log("4. Téléchargement du PDF...");
        
        const pdfBase64 = await page.evaluate(async (url) => {
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        }, pdfUrl);

        const buffer = Buffer.from(pdfBase64, 'base64');
        
        console.log("5. Analyse du texte du PDF...");
        const pdfData = await pdfParse(buffer);
        const text = pdfData.text;

        const hasSA = /Revolut\s+Bank\s*[,.]?\s*S\.?A\.?/i.test(text);
        
        let effectiveDate = null;
        const dateRegex = /(?:entrée\s+en\s+vigueur|applicables?\s+à\s+compter\s+du)[^.]*?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i;
        const dateMatch = text.match(dateRegex);
        
        if (dateMatch) {
            const mois = {'janvier':0,'février':1,'mars':2,'avril':3,'mai':4,'juin':5,'juillet':6,'août':7,'septembre':8,'octobre':9,'novembre':10,'décembre':11};
            const d = new Date(parseInt(dateMatch[3]), mois[dateMatch[2].toLowerCase()], parseInt(dateMatch[1]));
            effectiveDate = d.toISOString();
            console.log("✅ Date d'entrée en vigueur trouvée :", effectiveDate);
        }

        const pageText = await page.evaluate(() => document.body.innerText);
        const versionMatch = pageText.match(/(\d+\.\d+\.\d+)\s*·\s*(\d{1,2}\s+[a-zéû]+\s+\d{4})/i);

        const status = {
            success: true,
            hasSA: hasSA,
            effectiveDate: effectiveDate,
            pdfUrl: pdfUrl,
            pageNum: 1,
            version: versionMatch ? versionMatch[1] : null,
            dateStr: versionMatch ? versionMatch[2] : null,
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
        console.log("✅ Succès ! status.json a été mis à jour.");

    } catch (error) {
        console.error("❌ Erreur :", error.message);
        fs.writeFileSync('status.json', JSON.stringify({ 
            success: false, 
            error: error.message, 
            updatedAt: new Date().toISOString() 
        }, null, 2));
        process.exit(1);
    } finally {
        if (browser) await browser.close();
    }
}

main();
