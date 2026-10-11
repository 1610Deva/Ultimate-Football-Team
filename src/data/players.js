const data = [
  // Goalkeepers (6)
  ['Thibaut Courtois','GK',90,'Belgium','🇧🇪'],
  ['Alisson Becker','GK',89,'Brazil','🇧🇷'],
  ['Gianluigi Donnarumma','GK',88,'Italy','🇮🇹'],
  ['Mike Maignan','GK',87,'France','🇫🇷'],
  ['Manuel Neuer','GK',87,'Germany','🇩🇪'],
  ['Gianluigi Buffon','GK',94,'Italy','🇮🇹',true],

  // Right-backs (5)
  ['Achraf Hakimi','RB',90,'Morocco','🇲🇦'],
  ['Trent Alexander-Arnold','RB',87,'England','🏴'],
  ['Dani Carvajal','RB',85,'Spain','🇪🇸'],
  ['Jules Koundé','RB',86,'France','🇫🇷'],
  ['Reece James','RB',83,'England','🏴'],

  // Left-backs (5)
  ['Theo Hernández','LB',89,'France','🇫🇷'],
  ['Nuno Mendes','LB',88,'Portugal','🇵🇹'],
  ['Alphonso Davies','LB',86,'Canada','🇨🇦'],
  ['Federico Dimarco','LB',85,'Italy','🇮🇹'],
  ['Álex Grimaldo','LB',86,'Spain','🇪🇸'],

  // Centre-backs (8)
  ['Virgil van Dijk','CB',91,'Netherlands','🇳🇱'],
  ['William Saliba','CB',89,'France','🇫🇷'],
  ['Antonio Rüdiger','CB',88,'Germany','🇩🇪'],
  ['Alessandro Bastoni','CB',89,'Italy','🇮🇹'],
  ['Rúben Dias','CB',88,'Portugal','🇵🇹'],
  ['Ronald Araújo','CB',86,'Uruguay','🇺🇾'],
  ['Marquinhos','CB',87,'Brazil','🇧🇷'],
  ['Paolo Maldini','CB',94,'Italy','🇮🇹',true],

  // Central midfielders (10)
  ['Rodri','CM',91,'Spain','🇪🇸'],
  ['Jude Bellingham','CM',91,'England','🏴'],
  ['Pedri','CM',90,'Spain','🇪🇸'],
  ['Federico Valverde','CM',90,'Uruguay','🇺🇾'],
  ['Kevin De Bruyne','CM',90,'Belgium','🇧🇪'],
  ['Vitinha','CM',89,'Portugal','🇵🇹'],
  ['Bruno Fernandes','CM',87,'Portugal','🇵🇹'],
  ['Alexis Mac Allister','CM',86,'Argentina','🇦🇷'],
  ['Andrés Iniesta','CM',94,'Spain','🇪🇸',true],
  ['Zinedine Zidane','CM',96,'France','🇫🇷',true],

  // Right wing (5)
  ['Mohamed Salah','RW',91,'Egypt','🇪🇬'],
  ['Lamine Yamal','RW',90,'Spain','🇪🇸'],
  ['Bukayo Saka','RW',89,'England','🏴'],
  ['Ousmane Dembélé','RW',90,'France','🇫🇷'],
  ['Lionel Messi','RW',90,'Argentina','🇦🇷'],

  // Left wing (5)
  ['Vinícius Júnior','LW',92,'Brazil','🇧🇷'],
  ['Kylian Mbappé','LW',92,'France','🇫🇷'],
  ['Raphinha','LW',89,'Brazil','🇧🇷'],
  ['Khvicha Kvaratskhelia','LW',89,'Georgia','🇬🇪'],
  ['Ronaldinho','LW',94,'Brazil','🇧🇷',true],

  // Strikers (6)
  ['Erling Haaland','ST',92,'Norway','🇳🇴'],
  ['Harry Kane','ST',91,'England','🏴'],
  ['Robert Lewandowski','ST',89,'Poland','🇵🇱'],
  ['Lautaro Martínez','ST',89,'Argentina','🇦🇷'],
  ['Alexander Isak','ST',88,'Sweden','🇸🇪'],
  ['Ronaldo Nazário','ST',96,'Brazil','🇧🇷',true],
];

export const PLAYERS = data.map(([name,position,rating,nation,flag,legend],id) => ({
  id, name, position, rating, nation, flag, legend: Boolean(legend),
}));

export const COACHES = [
  { id: 'pep', name: 'Pep Guardiola', rating: 94, nation: 'Spain', flag: '🇪🇸' },
  { id: 'carlo', name: 'Carlo Ancelotti', rating: 92, nation: 'Italy', flag: '🇮🇹' },
  { id: 'luis', name: 'Luis Enrique', rating: 91, nation: 'Spain', flag: '🇪🇸' },
  { id: 'arteta', name: 'Mikel Arteta', rating: 89, nation: 'Spain', flag: '🇪🇸' },
  { id: 'simeone', name: 'Diego Simeone', rating: 89, nation: 'Argentina', flag: '🇦🇷' },
  { id: 'mourinho', name: 'José Mourinho', rating: 86, nation: 'Portugal', flag: '🇵🇹' },
];

export const SLOTS = [
  { id: 'GK', position: 'GK', label: 'Goalkeeper' },
  { id: 'RB', position: 'RB', label: 'Right Back' },
  { id: 'CB1', position: 'CB', label: 'Centre Back' },
  { id: 'CB2', position: 'CB', label: 'Centre Back' },
  { id: 'LB', position: 'LB', label: 'Left Back' },
  { id: 'CM1', position: 'CM', label: 'Midfielder' },
  { id: 'CM2', position: 'CM', label: 'Midfielder' },
  { id: 'CM3', position: 'CM', label: 'Midfielder' },
  { id: 'RW', position: 'RW', label: 'Right Wing' },
  { id: 'ST', position: 'ST', label: 'Striker' },
  { id: 'LW', position: 'LW', label: 'Left Wing' },
];

export const ROWS = [
  ['LW','ST','RW'],
  ['CM1','CM2','CM3'],
  ['LB','CB1','CB2','RB'],
  ['GK'],
];

export function evaluateSquad(roster, coach) {
  const picked = Object.values(roster);
  if (picked.length !== 11 || !coach) return null;
  const playerQuality = picked.reduce((sum,p) => sum + p.rating,0) / 11;
  const matches = picked.reduce((sum,p,i) =>
    sum + picked.slice(i+1).filter(other => other.nation === p.nation).length, 0);
  const managerMatches = picked.filter(p => p.nation === coach.nation).length;
  const chemistry = Math.min(100, 58 + matches * 2 + managerMatches * 2);
  const overall = Number((playerQuality * .65 + chemistry * .20 + coach.rating * .15).toFixed(1));
  let trophy;
  if (overall >= 88.1) trophy = { name: 'SIXTUPLE WINNER', emoji: '👑', detail: 'Enam gelar dalam satu musim. Tim legenda!' };
  else if (overall >= 86.5) trophy = { name: 'TREBLE WINNER', emoji: '🏆', detail: 'Liga, piala domestik, dan Champions League!' };
  else if (overall >= 85.1) trophy = { name: 'CHAMPIONS LEAGUE WINNER', emoji: '🌟', detail: 'Kampiun Eropa — malam yang bersejarah!' };
  else if (overall >= 84.5) trophy = { name: 'DOMESTIC DOUBLE', emoji: '🥇', detail: 'Menjuarai liga dan piala domestik.' };
  else if (overall >= 83.8) trophy = { name: 'LEAGUE CHAMPION', emoji: '🏅', detail: 'Satu musim penuh konsistensi!' };
  else trophy = { name: 'DOMESTIC CUP WINNER', emoji: '🏅', detail: 'Satu gelar piala berhasil diamankan!' };
  return { playerQuality: Number(playerQuality.toFixed(1)), chemistry, overall, trophy };
}
