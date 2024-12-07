const express = require('express');
const multer = require('multer');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const {Storage} = require('@google-cloud/storage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configurez CORS avant toutes les routes
app.use(cors({
  origin: ['https://audio-transcriber-inky.vercel.app', 'http://localhost:5174'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // cache pour 24 heures
}));

// Configuration de Google Cloud Storage
const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const bucketName = 'audio-transcriber-bucket-flo'; // Mettez le nom exact de votre bucket
const bucket = storage.bucket(bucketName);

const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: uploadStorage });

const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fonction pour uploader un fichier sur GCS
const uploadToGCS = async (filePath) => {
  const filename = path.basename(filePath);
  await bucket.upload(filePath, {
    destination: filename,
  });
  return `gs://${bucketName}/${filename}`;
};

app.post('/process-audio', upload.single('audio'), async (req, res) => {
  let gcsUri = null;
  let wavFile = null;
  
  try {
    if (!req.file) {
      return res.status(400).send('Aucun fichier audio fourni');
    }

    console.log('Fichier reçu:', req.file.path);

    // Convertir en WAV
    wavFile = req.file.path + '.wav';
    await new Promise((resolve, reject) => {
      ffmpeg(req.file.path)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .audioBitrate('64k')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(wavFile);
    });

    console.log('Conversion WAV terminée:', wavFile);

    // Upload sur GCS
    console.log('Upload vers Google Cloud Storage...');
    gcsUri = await uploadToGCS(wavFile);
    console.log('Fichier uploadé:', gcsUri);

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'fr-FR',
      enableAutomaticPunctuation: true,
      model: 'default',
      useEnhanced: true
    };

    const audio = {
      uri: gcsUri
    };

    const request = {
      audio: audio,
      config: config,
    };

    console.log('Démarrage de la transcription...');
    const [operation] = await speechClient.longRunningRecognize(request);
    console.log('Attente des résultats...');
    const [response] = await operation.promise();
    
    const transcript = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    console.log('Transcription terminée, génération du résumé...');
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Résume le texte suivant qui est une transcription de réunion en français. 
                   Identifie les points clés et les décisions importantes :
                   ${transcript}`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    // Nettoyage
    try {
      if (req.file.path) fs.unlinkSync(req.file.path);
      if (wavFile) fs.unlinkSync(wavFile);
      if (gcsUri) {
        const filename = path.basename(gcsUri);
        await bucket.file(filename).delete();
      }
    } catch (e) {
      console.error('Erreur lors du nettoyage:', e);
    }

    res.json({
      success: true,
      transcript: transcript,
      summary: summary
    });

  } catch (error) {
    console.error('Erreur:', error);
    // Nettoyage en cas d'erreur
    try {
      if (req.file && req.file.path) fs.unlinkSync(req.file.path);
      if (wavFile && fs.existsSync(wavFile)) fs.unlinkSync(wavFile);
      if (gcsUri) {
        const filename = path.basename(gcsUri);
        await bucket.file(filename).delete();
      }
    } catch (e) {
      console.error('Erreur lors du nettoyage:', e);
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement de l\'audio'
    });
  }
});

app.get('/', (req, res) => {
  res.send('Serveur de transcription audio en ligne');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
