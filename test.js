try { eval(new ActiveXObject('Scripting.FileSystemObject').OpenTextFile('app.js', 1).ReadAll()); WScript.Echo('OK'); } catch(e) { WScript.Echo(e.message); }  
