import express from 'express';

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #000; color: #fff; text-align: center;">
        <h1 style="font-style: italic; font-weight: 900; font-size: 3rem;">ATTENDLY PRO MOBILE</h1>
        <p style="font-weight: bold; letter-spacing: 2px; color: #555;">NATIVE FLUTTER ARCHITECTURE DEPLOYED</p>
        <div style="margin-top: 40px; padding: 20px; border: 2px dashed #333; border-radius: 20px;">
          <p>This project is now configured as a <b>Pure Cross-Platform Flutter Mobile Application</b>.</p>
          <p>Access the source code in the <code>/attendance_pro_app</code> directory.</p>
        </div>
        <p style="margin-top: 40px; font-size: 0.8rem; color: #888;">Export to Android Studio or VS Code to run natively.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Mobile architecture placeholder running on port ' + PORT);
});
