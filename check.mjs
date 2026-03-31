const key = process.env.KEY || 'AIzaSyDD-8OgAq4D6CS1IBk0KBX5GD38vbHtwMs';
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  .then(res => res.json())
  .then(data => {
    if (data.models) console.log(data.models.map(m => m.name).join('\n'));
    else console.log(data);
  })
  .catch(console.error);
