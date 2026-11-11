const fs = require('fs');
const https = require('https');

// Fonction pour télécharger une URL (sans librairie externe)
function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return download(res.headers.location).then(resolve).catch(reject);
            }
            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
        }).on('error', reject);
    });
}

async function main() {
    try {
        console.log("1. Récupération de la page d'historique...");
        const htmlBuffer = await download('https://www.revolut.com/fr-FR/legal/terms/history/');
        const html = htmlBuffer.toString('utf8');

        // Trouver le premier lien PDF (le plus récent)
        const pdfMatch = html.match(/href="(https:\/\/cdn\.revolut\.com[^"]+\.pdf)"/);
        if (!pdfMatch) throw new Error("Lien PDF introuvable dans le HTML.");
        const pdfUrl = pdfMatch[1];
        console.log("PDF trouvé :", pdfUrl);

        console.log("2. Téléchargement du PDF...");
        const pdfBuffer = await download(pdfUrl);

        // Pour extraire le texte du PDF sans librairie lourde, on utilise pdf-parse
        // (Il sera installé par GitHub Actions)
        const pdf = require('pdf-parse');
        const pdfData = await pdf(pdfBuffer);
        const text = pdfData.text;

        console.log("3. Analyse du texte...");
        const hasSA = /Revolut\s+Bank\s*[,.]?\s*S\.?A\.?/i.test(text);
        
        // Recherche de la date d'entrée en vigueur
        let effectiveDate = null;
        let pageNum = 1; // On indiquera page 1 par défaut, car pdf-parse lit tout d'un coup
        const dateRegex = /(?:entrée\s+en\s+vigueur|applicables?\s+à\s+compter\s+du)[^.]*?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i;
        const dateMatch = text.match(dateRegex);
        
        if (dateMatch) {
            const mois = {'janvier':0,'février':1,'mars':2,'avril':3,'mai':4,'juin':5,'juillet':6,'août':7,'septembre':8,'octobre':9,'novembre':10,'décembre':11};
            const d = new Date(parseInt(dateMatch[3]), mois[dateMatch[2].toLowerCase()], parseInt(dateMatch[1]));
            effectiveDate = d.toISOString();
        }

        // Extraction du numéro de version depuis la page HTML
        const versionMatch = html.match(/(\d+\.\d+\.\d+)\s*·\s*(\d{1,2}\s+[a-zéû]+\s+\d{4})/i);

        const status = {
            hasSA: hasSA,
            effectiveDate: effectiveDate,
            pdfUrl: pdfUrl,
            pageNum: pageNum,
            version: versionMatch ? versionMatch[1] : null,
            dateStr: versionMatch ? versionMatch[2] : null,
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
        console.log("✅ Succès ! status.json a été mis à jour.");

    } catch (error) {
        console.error("Erreur :", error);
        fs.writeFileSync('status.json', JSON.stringify({ error: error.message, updatedAt: new Date().toISOString() }, null, 2));
        process.exit(1);
    }
}

main();
