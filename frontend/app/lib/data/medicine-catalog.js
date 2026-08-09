/**
 * Medicine catalog for rural/semi-urban Indian medical shops.
 *
 * This is the backbone of the outbreak correlation: a spike in what a shop sells is
 * only a disease signal if we know WHICH disease each medicine points at, and how
 * strongly. `diseaseSignals` carries that weight.
 *
 * Weights are deliberately conservative. Paracetamol is sold for everything, so it
 * points weakly at many fevers; ORS points strongly at diarrhoea/cholera because
 * almost nobody buys it casually. A confident correlation needs a specific medicine
 * spiking, not just a general one.
 *
 * `schedule`:
 *   OTC — the chatbot may suggest it for self-medication.
 *   RX  — the chatbot may only record it when the user says a doctor prescribed it,
 *         and never recommends it on its own.
 *
 * `description` is what gets embedded for vector search, so it is written the way a
 * villager would describe the problem, not the way a pharmacopoeia would.
 */

export const MEDICINE_CATEGORIES = [
  "ANTIPYRETIC",
  "ANALGESIC",
  "ANTIBIOTIC",
  "ANTIMALARIAL",
  "ORAL_REHYDRATION",
  "ANTIDIARRHEAL",
  "ANTIEMETIC",
  "COUGH_COLD",
  "ANTIHISTAMINE",
  "ANTACID",
  "VITAMIN_SUPPLEMENT",
  "ANTISEPTIC",
  "ANTIFUNGAL",
  "RESPIRATORY",
  "DERMATOLOGY",
];

export const MEDICINE_CATALOG = [
  // ---------- Fever / pain ----------
  {
    sku: "MED-PARA-650",
    brand: "Dolo 650",
    salt: "Paracetamol 650mg",
    category: "ANTIPYRETIC",
    schedule: "OTC",
    packSize: "15 tablets",
    mrp: 34,
    description:
      "Bukhar aur badan dard ki sabse aam dawai. Fever, headache, body ache, cold ke saath aane wala taap. Har tarah ke bukhar me di jaati hai isliye akeli spike se bimari pakki nahi hoti.",
    symptoms: ["fever", "bukhar", "body ache", "badan dard", "headache", "sar dard", "taap"],
    diseaseSignals: [
      { disease: "GENERAL_FEVER", weight: 0.35 },
      { disease: "VIRAL_FEVER", weight: 0.3 },
      { disease: "DENGUE", weight: 0.2 },
      { disease: "MALARIA", weight: 0.15 },
      { disease: "INFLUENZA", weight: 0.2 },
    ],
    maxSelfMedicationDays: 3,
    typicalQuantity: 10,
  },
  {
    sku: "MED-PARA-500",
    brand: "Crocin Advance",
    salt: "Paracetamol 500mg",
    category: "ANTIPYRETIC",
    schedule: "OTC",
    packSize: "15 tablets",
    mrp: 30,
    description:
      "Halka bukhar aur sar dard ke liye. Bachchon aur bade dono me use hoti hai. Dengue ke shak me safe painkiller yahi hai.",
    symptoms: ["fever", "bukhar", "headache", "sar dard", "mild pain"],
    diseaseSignals: [
      { disease: "GENERAL_FEVER", weight: 0.35 },
      { disease: "VIRAL_FEVER", weight: 0.3 },
      { disease: "DENGUE", weight: 0.2 },
    ],
    maxSelfMedicationDays: 3,
    typicalQuantity: 10,
  },
  {
    sku: "MED-PARA-SYP",
    brand: "Calpol 250 Syrup",
    salt: "Paracetamol 250mg/5ml",
    category: "ANTIPYRETIC",
    schedule: "OTC",
    packSize: "60 ml bottle",
    mrp: 48,
    description:
      "Bachchon ke bukhar ka syrup. Chhote bachche tablet nahi kha paate to yahi diya jaata hai. Bachchon me bukhar ki lehar ka strong indicator hai.",
    symptoms: ["child fever", "bachche ko bukhar", "baby fever", "teething pain"],
    diseaseSignals: [
      { disease: "VIRAL_FEVER", weight: 0.4 },
      { disease: "GENERAL_FEVER", weight: 0.3 },
      { disease: "MEASLES", weight: 0.2 },
      { disease: "CHICKENPOX", weight: 0.15 },
    ],
    maxSelfMedicationDays: 3,
    typicalQuantity: 1,
  },
  {
    sku: "MED-IBU-400",
    brand: "Brufen 400",
    salt: "Ibuprofen 400mg",
    category: "ANALGESIC",
    schedule: "OTC",
    packSize: "15 tablets",
    mrp: 42,
    description:
      "Jodo ka dard, sujan aur muscle pain ke liye. Chikungunya me jodo ke dard ke liye bahut bikti hai. Dengue ke shak me nahi deni chahiye kyunki bleeding risk badhata hai.",
    symptoms: ["joint pain", "jodo ka dard", "swelling", "sujan", "muscle pain", "back pain"],
    diseaseSignals: [
      { disease: "CHIKUNGUNYA", weight: 0.45 },
      { disease: "VIRAL_FEVER", weight: 0.15 },
    ],
    contraindications: ["DENGUE"],
    maxSelfMedicationDays: 3,
    typicalQuantity: 10,
  },
  {
    sku: "MED-NIME-100",
    brand: "Nise 100",
    salt: "Nimesulide 100mg",
    category: "ANALGESIC",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 38,
    description:
      "Tez dard aur sujan ke liye. Doctor ke kehne par hi leni chahiye, liver par asar karti hai.",
    symptoms: ["severe pain", "tez dard", "inflammation"],
    diseaseSignals: [{ disease: "CHIKUNGUNYA", weight: 0.25 }],
    contraindications: ["DENGUE"],
    typicalQuantity: 10,
  },

  // ---------- Dehydration / diarrhoea ----------
  {
    sku: "MED-ORS-SACH",
    brand: "Electral ORS",
    salt: "Oral Rehydration Salts WHO formula",
    category: "ORAL_REHYDRATION",
    schedule: "OTC",
    packSize: "21.8g sachet",
    mrp: 22,
    description:
      "Dast, ulti aur pani ki kami me sabse zaroori. Loose motion, cholera, garmi me dehydration. Log ise shaukiya nahi kharidte, isliye iski spike diarrhoea outbreak ka bahut pakka signal hai.",
    symptoms: ["diarrhea", "dast", "loose motion", "vomiting", "ulti", "dehydration", "pani ki kami"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.75 },
      { disease: "CHOLERA", weight: 0.6 },
      { disease: "TYPHOID", weight: 0.2 },
    ],
    maxSelfMedicationDays: 3,
    typicalQuantity: 6,
  },
  {
    sku: "MED-ZINC-20",
    brand: "Zinconia 20",
    salt: "Zinc Sulphate 20mg dispersible",
    category: "ORAL_REHYDRATION",
    schedule: "OTC",
    packSize: "15 tablets",
    mrp: 35,
    description:
      "Bachchon ke dast me ORS ke saath di jaati hai. 14 din ka course hota hai. ORS ke saath iski spike bachchon me diarrhoea outbreak dikhati hai.",
    symptoms: ["child diarrhea", "bachche ko dast", "loose motion"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.65 },
      { disease: "CHOLERA", weight: 0.4 },
    ],
    maxSelfMedicationDays: 14,
    typicalQuantity: 15,
  },
  {
    sku: "MED-ORS-LIQ",
    brand: "Enerzal Liquid",
    salt: "Electrolyte energy drink",
    category: "ORAL_REHYDRATION",
    schedule: "OTC",
    packSize: "200 ml",
    mrp: 25,
    description:
      "Garmi, kamzori aur halki dehydration me. Bukhar ke baad kamzori me bhi lete hain.",
    symptoms: ["weakness", "kamzori", "dehydration", "heat exhaustion", "garmi"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.3 },
      { disease: "GENERAL_FEVER", weight: 0.15 },
    ],
    maxSelfMedicationDays: 5,
    typicalQuantity: 4,
  },
  {
    sku: "MED-ORNI-OZ",
    brand: "Ornidazole-O",
    salt: "Ofloxacin 200mg + Ornidazole 500mg",
    category: "ANTIDIARRHEAL",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 96,
    description:
      "Infection wale dast ke liye. Khoon ya aam wale dast, pechish me doctor deta hai. Iski spike bacterial diarrhoea ya cholera cluster batati hai.",
    symptoms: ["bloody diarrhea", "pechish", "dysentery", "infective diarrhea", "aam wale dast"],
    diseaseSignals: [
      { disease: "CHOLERA", weight: 0.55 },
      { disease: "DIARRHEA", weight: 0.5 },
      { disease: "TYPHOID", weight: 0.3 },
    ],
    typicalQuantity: 10,
  },
  {
    sku: "MED-RACE-100",
    brand: "Racecad 100",
    salt: "Racecadotril 100mg",
    category: "ANTIDIARRHEAL",
    schedule: "RX",
    packSize: "10 capsules",
    mrp: 88,
    description: "Acute dast me pani ka nikalna kam karti hai. Doctor ki salah par.",
    symptoms: ["acute diarrhea", "watery stool", "patla dast"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.5 },
      { disease: "CHOLERA", weight: 0.35 },
    ],
    typicalQuantity: 10,
  },

  // ---------- Vomiting / stomach ----------
  {
    sku: "MED-DOMP-10",
    brand: "Domstal 10",
    salt: "Domperidone 10mg",
    category: "ANTIEMETIC",
    schedule: "OTC",
    packSize: "10 tablets",
    mrp: 42,
    description:
      "Ulti aur ji-michlane ke liye. Khana na pachne, gas aur ulti me di jaati hai.",
    symptoms: ["vomiting", "ulti", "nausea", "ji michlana", "indigestion"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.3 },
      { disease: "TYPHOID", weight: 0.25 },
      { disease: "HEPATITIS", weight: 0.25 },
    ],
    maxSelfMedicationDays: 2,
    typicalQuantity: 10,
  },
  {
    sku: "MED-ONDA-4",
    brand: "Emeset 4",
    salt: "Ondansetron 4mg",
    category: "ANTIEMETIC",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 55,
    description:
      "Tez ulti rokne ke liye. Jab ulti band hi na ho rahi ho. Doctor ki salah par.",
    symptoms: ["severe vomiting", "tez ulti", "persistent nausea"],
    diseaseSignals: [
      { disease: "CHOLERA", weight: 0.4 },
      { disease: "DIARRHEA", weight: 0.3 },
      { disease: "TYPHOID", weight: 0.25 },
    ],
    typicalQuantity: 10,
  },
  {
    sku: "MED-PANT-40",
    brand: "Pan 40",
    salt: "Pantoprazole 40mg",
    category: "ANTACID",
    schedule: "OTC",
    packSize: "15 tablets",
    mrp: 88,
    description:
      "Pet me jalan, acidity aur khatta dakar. Khali pet dard me bhi. Bimari ka signal kam hai, background sale zyada hai.",
    symptoms: ["acidity", "jalan", "heartburn", "gas", "stomach burning", "khatta dakar"],
    diseaseSignals: [],
    maxSelfMedicationDays: 7,
    typicalQuantity: 15,
  },
  {
    sku: "MED-DIGE-SYP",
    brand: "Digene Syrup",
    salt: "Antacid gel with Simethicone",
    category: "ANTACID",
    schedule: "OTC",
    packSize: "200 ml",
    mrp: 145,
    description: "Gas, apach aur pet phoolne me. Turant aaram ke liye.",
    symptoms: ["gas", "bloating", "pet phoolna", "acidity", "apach"],
    diseaseSignals: [],
    maxSelfMedicationDays: 7,
    typicalQuantity: 1,
  },

  // ---------- Cough / cold / respiratory ----------
  {
    sku: "MED-CETZ-10",
    brand: "Cetzine 10",
    salt: "Cetirizine 10mg",
    category: "ANTIHISTAMINE",
    schedule: "OTC",
    packSize: "10 tablets",
    mrp: 28,
    description:
      "Naak behna, chheenk, allergy aur khujli. Sardi ke saath sabse zyada bikne wali dawai.",
    symptoms: ["runny nose", "naak behna", "sneezing", "chheenk", "allergy", "itching", "khujli"],
    diseaseSignals: [
      { disease: "INFLUENZA", weight: 0.3 },
      { disease: "VIRAL_FEVER", weight: 0.2 },
      { disease: "COVID", weight: 0.15 },
    ],
    maxSelfMedicationDays: 5,
    typicalQuantity: 10,
  },
  {
    sku: "MED-COUGH-SYP",
    brand: "Benadryl Cough Syrup",
    salt: "Diphenhydramine + Ammonium chloride",
    category: "COUGH_COLD",
    schedule: "OTC",
    packSize: "100 ml",
    mrp: 132,
    description:
      "Balgam wali khansi ke liye. Raat me khansi se neend na aaye to lete hain. Respiratory outbreak me tezi se bikti hai.",
    symptoms: ["cough", "khansi", "phlegm", "balgam", "chest congestion", "seene me jakadan"],
    diseaseSignals: [
      { disease: "INFLUENZA", weight: 0.4 },
      { disease: "COVID", weight: 0.3 },
      { disease: "PNEUMONIA", weight: 0.3 },
      { disease: "TUBERCULOSIS", weight: 0.2 },
    ],
    maxSelfMedicationDays: 5,
    typicalQuantity: 1,
  },
  {
    sku: "MED-DRYCOUGH",
    brand: "Ascoril D Plus",
    salt: "Dextromethorphan + Chlorpheniramine",
    category: "COUGH_COLD",
    schedule: "OTC",
    packSize: "100 ml",
    mrp: 128,
    description:
      "Sookhi khansi ke liye jisme balgam nahi aata. Gale me khich-khich aur lagatar khansi me.",
    symptoms: ["dry cough", "sookhi khansi", "throat irritation", "gale me khich khich"],
    diseaseSignals: [
      { disease: "COVID", weight: 0.4 },
      { disease: "INFLUENZA", weight: 0.3 },
      { disease: "TUBERCULOSIS", weight: 0.25 },
    ],
    maxSelfMedicationDays: 5,
    typicalQuantity: 1,
  },
  {
    sku: "MED-STEAM-CAP",
    brand: "Karvol Plus",
    salt: "Menthol + Eucalyptus inhalant capsules",
    category: "RESPIRATORY",
    schedule: "OTC",
    packSize: "10 capsules",
    mrp: 62,
    description: "Band naak kholne ke liye bhaap me daalte hain. Sardi-zukam me.",
    symptoms: ["blocked nose", "band naak", "congestion", "cold", "zukam"],
    diseaseSignals: [
      { disease: "INFLUENZA", weight: 0.25 },
      { disease: "VIRAL_FEVER", weight: 0.15 },
    ],
    maxSelfMedicationDays: 7,
    typicalQuantity: 1,
  },
  {
    sku: "MED-SALB-INH",
    brand: "Asthalin Inhaler",
    salt: "Salbutamol 100mcg",
    category: "RESPIRATORY",
    schedule: "RX",
    packSize: "200 doses",
    mrp: 148,
    description:
      "Saans phoolne aur dama ke liye. Pneumonia ya severe respiratory illness me doctor deta hai.",
    symptoms: ["breathlessness", "saans phoolna", "asthma", "dama", "wheezing"],
    diseaseSignals: [
      { disease: "PNEUMONIA", weight: 0.45 },
      { disease: "COVID", weight: 0.3 },
    ],
    typicalQuantity: 1,
  },

  // ---------- Antibiotics ----------
  {
    sku: "MED-AZI-500",
    brand: "Azithral 500",
    salt: "Azithromycin 500mg",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "5 tablets",
    mrp: 118,
    description:
      "Gale, chest aur typhoid ke infection me. 3-5 din ka course. Iski spike bacterial respiratory ya typhoid cluster ka strong signal hai.",
    symptoms: ["throat infection", "gale ka infection", "chest infection", "typhoid fever"],
    diseaseSignals: [
      { disease: "TYPHOID", weight: 0.45 },
      { disease: "PNEUMONIA", weight: 0.4 },
      { disease: "INFLUENZA", weight: 0.2 },
    ],
    typicalQuantity: 5,
  },
  {
    sku: "MED-AMOX-625",
    brand: "Augmentin 625",
    salt: "Amoxicillin 500mg + Clavulanic acid 125mg",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 210,
    description:
      "Aam bacterial infection ke liye. Chest infection, ghaav ka infection, dant ka infection.",
    symptoms: ["bacterial infection", "chest infection", "wound infection", "ghaav ka infection"],
    diseaseSignals: [
      { disease: "PNEUMONIA", weight: 0.45 },
      { disease: "TYPHOID", weight: 0.25 },
    ],
    typicalQuantity: 10,
  },
  {
    sku: "MED-CEFI-200",
    brand: "Taxim-O 200",
    salt: "Cefixime 200mg",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 165,
    description:
      "Typhoid aur peshab ke infection me doctor deta hai. Typhoid ka sabse aam antibiotic.",
    symptoms: ["typhoid", "urine infection", "peshab me jalan", "enteric fever"],
    diseaseSignals: [
      { disease: "TYPHOID", weight: 0.6 },
      { disease: "PNEUMONIA", weight: 0.2 },
    ],
    typicalQuantity: 10,
  },
  {
    sku: "MED-DOXY-100",
    brand: "Doxy-1",
    salt: "Doxycycline 100mg",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "10 capsules",
    mrp: 78,
    description:
      "Scrub typhus, leptospirosis aur barish ke mausam wale bukhar me. Monsoon fever cluster ka signal.",
    symptoms: ["monsoon fever", "scrub typhus", "leptospirosis", "barish wala bukhar"],
    diseaseSignals: [
      { disease: "OTHER", weight: 0.4 },
      { disease: "GENERAL_FEVER", weight: 0.25 },
    ],
    typicalQuantity: 10,
  },
  {
    sku: "MED-METRO-400",
    brand: "Flagyl 400",
    salt: "Metronidazole 400mg",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 46,
    description: "Aamvat, pechish aur pet ke keede wale infection me.",
    symptoms: ["amoebiasis", "pechish", "stomach infection", "pet ka infection"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.45 },
      { disease: "CHOLERA", weight: 0.3 },
    ],
    typicalQuantity: 10,
  },

  // ---------- Vector-borne ----------
  {
    sku: "MED-ACT-KIT",
    brand: "Falcigo Kit",
    salt: "Artesunate + Sulfadoxine-Pyrimethamine (ACT)",
    category: "ANTIMALARIAL",
    schedule: "RX",
    packSize: "1 kit (3 days)",
    mrp: 145,
    description:
      "Falciparum malaria ka sarkari course. Sirf malaria positive hone par diya jaata hai, isliye iski spike malaria outbreak ka lagbhag pakka signal hai.",
    symptoms: ["malaria", "falciparum", "thand ke saath bukhar", "chills with fever"],
    diseaseSignals: [{ disease: "MALARIA", weight: 0.9 }],
    typicalQuantity: 1,
  },
  {
    sku: "MED-CQ-250",
    brand: "Lariago 250",
    salt: "Chloroquine Phosphate 250mg",
    category: "ANTIMALARIAL",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 42,
    description:
      "Vivax malaria ke liye. Thand lagkar aane wale bukhar me test ke baad diya jaata hai.",
    symptoms: ["malaria", "vivax", "chills", "thand lagkar bukhar", "shivering fever"],
    diseaseSignals: [{ disease: "MALARIA", weight: 0.85 }],
    typicalQuantity: 10,
  },
  {
    sku: "MED-PRIMA-15",
    brand: "Primaquine 15",
    salt: "Primaquine 15mg",
    category: "ANTIMALARIAL",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 38,
    description: "Malaria ka relapse rokne ke liye 14 din ka course.",
    symptoms: ["malaria relapse", "malaria radical cure"],
    diseaseSignals: [{ disease: "MALARIA", weight: 0.8 }],
    typicalQuantity: 14,
  },
  {
    sku: "MED-PAPAYA-SYP",
    brand: "Caripill Syrup",
    salt: "Carica papaya leaf extract",
    category: "VITAMIN_SUPPLEMENT",
    schedule: "OTC",
    packSize: "100 ml",
    mrp: 190,
    description:
      "Dengue me platelet girne par log lete hain. Papite ke patte ka ras. Iski spike dengue cluster ka bahut sidha signal hai kyunki aur kisi bimari me nahi kharidi jaati.",
    symptoms: ["low platelet", "platelet kam", "dengue recovery", "dengue"],
    diseaseSignals: [{ disease: "DENGUE", weight: 0.85 }],
    maxSelfMedicationDays: 7,
    typicalQuantity: 1,
  },
  {
    sku: "MED-MOSQ-REP",
    brand: "Odomos Cream",
    salt: "N,N-Diethylbenzamide 12%",
    category: "ANTISEPTIC",
    schedule: "OTC",
    packSize: "50 g",
    mrp: 68,
    description:
      "Machhar bhagane ki cream. Dengue-malaria ke dar me log kharidte hain. Prevention signal hai, bimari ka nahi.",
    symptoms: ["mosquito bite", "machhar", "dengue prevention", "malaria prevention"],
    diseaseSignals: [
      { disease: "DENGUE", weight: 0.3 },
      { disease: "MALARIA", weight: 0.25 },
      { disease: "CHIKUNGUNYA", weight: 0.2 },
    ],
    maxSelfMedicationDays: 30,
    typicalQuantity: 1,
  },

  // ---------- Skin / rash ----------
  {
    sku: "MED-CALAM-LOT",
    brand: "Caladryl Lotion",
    salt: "Calamine + Zinc oxide",
    category: "DERMATOLOGY",
    schedule: "OTC",
    packSize: "100 ml",
    mrp: 155,
    description:
      "Chechak, khasra aur daane-khujli me lagate hain. Chickenpox outbreak me iski sale tez badhti hai.",
    symptoms: ["rash", "daane", "chickenpox", "chechak", "itching", "khujli", "measles", "khasra"],
    diseaseSignals: [
      { disease: "CHICKENPOX", weight: 0.65 },
      { disease: "MEASLES", weight: 0.45 },
      { disease: "CHIKUNGUNYA", weight: 0.15 },
    ],
    maxSelfMedicationDays: 10,
    typicalQuantity: 1,
  },
  {
    sku: "MED-ACIC-800",
    brand: "Acivir 800 DT",
    salt: "Acyclovir 800mg",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 240,
    description:
      "Chechak aur herpes ka antiviral. Chickenpox me doctor 5 din ka course deta hai.",
    symptoms: ["chickenpox", "chechak", "shingles", "herpes"],
    diseaseSignals: [{ disease: "CHICKENPOX", weight: 0.8 }],
    typicalQuantity: 10,
  },
  {
    sku: "MED-CLOTRI-CRM",
    brand: "Candid Cream",
    salt: "Clotrimazole 1%",
    category: "ANTIFUNGAL",
    schedule: "OTC",
    packSize: "20 g",
    mrp: 82,
    description: "Daad, khaaj aur fungal infection ke liye. Barsat me zyada bikti hai.",
    symptoms: ["ringworm", "daad", "fungal infection", "khaaj", "skin itching"],
    diseaseSignals: [],
    maxSelfMedicationDays: 21,
    typicalQuantity: 1,
  },
  {
    sku: "MED-POVID-SOL",
    brand: "Betadine Solution",
    salt: "Povidone Iodine 5%",
    category: "ANTISEPTIC",
    schedule: "OTC",
    packSize: "100 ml",
    mrp: 145,
    description: "Ghaav aur kat-chhil saaf karne ke liye antiseptic.",
    symptoms: ["wound", "ghaav", "cut", "injury", "antiseptic"],
    diseaseSignals: [],
    maxSelfMedicationDays: 14,
    typicalQuantity: 1,
  },

  // ---------- Liver / jaundice ----------
  {
    sku: "MED-LIV52",
    brand: "Liv.52 DS",
    salt: "Himsra + Kasani herbal hepatoprotective",
    category: "VITAMIN_SUPPLEMENT",
    schedule: "OTC",
    packSize: "60 tablets",
    mrp: 175,
    description:
      "Piliya aur liver kamzori me. Jaundice ke baad recovery me bahut lete hain. Hepatitis cluster ka signal.",
    symptoms: ["jaundice", "piliya", "liver weakness", "loss of appetite", "bhookh na lagna"],
    diseaseSignals: [{ disease: "HEPATITIS", weight: 0.7 }],
    maxSelfMedicationDays: 30,
    typicalQuantity: 1,
  },
  {
    sku: "MED-URSO-300",
    brand: "Udiliv 300",
    salt: "Ursodeoxycholic acid 300mg",
    category: "VITAMIN_SUPPLEMENT",
    schedule: "RX",
    packSize: "10 tablets",
    mrp: 320,
    description: "Liver ki bimari me doctor deta hai. Hepatitis ke ilaj ka hissa.",
    symptoms: ["liver disease", "jaundice", "piliya", "hepatitis"],
    diseaseSignals: [{ disease: "HEPATITIS", weight: 0.65 }],
    typicalQuantity: 10,
  },

  // ---------- TB ----------
  {
    sku: "MED-AKT-4",
    brand: "AKT-4 Kit",
    salt: "Isoniazid + Rifampicin + Pyrazinamide + Ethambutol",
    category: "ANTIBIOTIC",
    schedule: "RX",
    packSize: "28 tablets",
    mrp: 480,
    description:
      "TB ka 4-drug course. Sirf confirmed TB me diya jaata hai, isliye iski har sale ek confirmed TB case hai.",
    symptoms: ["tuberculosis", "tb", "2 hafte se khansi", "khoon wali khansi", "weight loss"],
    diseaseSignals: [{ disease: "TUBERCULOSIS", weight: 0.95 }],
    typicalQuantity: 1,
  },

  // ---------- Supplements ----------
  {
    sku: "MED-IFA-TAB",
    brand: "Autrin",
    salt: "Iron + Folic Acid",
    category: "VITAMIN_SUPPLEMENT",
    schedule: "OTC",
    packSize: "30 capsules",
    mrp: 96,
    description:
      "Khoon ki kami aur kamzori me. Garbhvati mahilaon ko routine diya jaata hai. Background sale hai, outbreak signal nahi.",
    symptoms: ["anemia", "khoon ki kami", "weakness", "kamzori", "pregnancy"],
    diseaseSignals: [],
    maxSelfMedicationDays: 30,
    typicalQuantity: 30,
  },
  {
    sku: "MED-VITC-500",
    brand: "Limcee 500",
    salt: "Vitamin C 500mg chewable",
    category: "VITAMIN_SUPPLEMENT",
    schedule: "OTC",
    packSize: "15 tablets",
    mrp: 32,
    description: "Immunity ke liye. Sardi-bukhar ke mausam me log khud lete hain.",
    symptoms: ["immunity", "weakness", "kamzori", "cold prevention"],
    diseaseSignals: [
      { disease: "VIRAL_FEVER", weight: 0.15 },
      { disease: "INFLUENZA", weight: 0.15 },
    ],
    maxSelfMedicationDays: 30,
    typicalQuantity: 15,
  },
  {
    sku: "MED-BCOMP-CAP",
    brand: "Becosules",
    salt: "Vitamin B-Complex with C",
    category: "VITAMIN_SUPPLEMENT",
    schedule: "OTC",
    packSize: "20 capsules",
    mrp: 45,
    description: "Kamzori, muh ke chhale aur bimari ke baad recovery me.",
    symptoms: ["weakness", "kamzori", "mouth ulcer", "muh ke chhale", "recovery"],
    diseaseSignals: [{ disease: "GENERAL_FEVER", weight: 0.1 }],
    maxSelfMedicationDays: 30,
    typicalQuantity: 20,
  },
  {
    sku: "MED-ORS-ZINC-KIT",
    brand: "ORS + Zinc Kit",
    salt: "ORS sachets with Zinc dispersible tablets",
    category: "ORAL_REHYDRATION",
    schedule: "OTC",
    packSize: "6 sachets + 14 tablets",
    mrp: 78,
    description:
      "Sarkari diarrhoea kit. ASHA aur anganwadi bhi baantti hain. Bachchon me dast ki lehar me sabse pehle khatam hoti hai.",
    symptoms: ["child diarrhea", "bachche ko dast", "dehydration", "loose motion"],
    diseaseSignals: [
      { disease: "DIARRHEA", weight: 0.8 },
      { disease: "CHOLERA", weight: 0.55 },
    ],
    maxSelfMedicationDays: 14,
    typicalQuantity: 1,
  },
];

/** Every disease code any medicine points at — used to validate against report-nlp codes. */
export const CATALOG_DISEASE_CODES = [
  ...new Set(
    MEDICINE_CATALOG.flatMap((item) => item.diseaseSignals?.map((signal) => signal.disease) || [])
  ),
];

/**
 * Text that gets embedded for vector search. Brand, salt, plain-language description
 * and symptom phrases all go in, so "mujhe sar dard aur ulti ho rahi" can find
 * Paracetamol and Domperidone without either word appearing literally.
 */
export function medicineEmbeddingText(medicine) {
  return [
    medicine.brand,
    medicine.salt,
    medicine.category?.replace(/_/g, " ").toLowerCase(),
    medicine.description,
    (medicine.symptoms || []).join(", "),
  ]
    .filter(Boolean)
    .join(". ");
}
