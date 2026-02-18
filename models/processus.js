const db = require('../util/database');
let SqlString = require('sqlstring'); //global declare
let datetime = require('node-datetime');
if (typeof localStorage === "undefined" || localStorage === null) {
  let LocalStorage = require('node-localstorage').LocalStorage;
  localStorage = new LocalStorage('./scratch');
}


module.exports = class Processus {


  constructor() {}



  static fetchAll() {
    return db.execute('SELECT * FROM lst_processus  order by id_processus DESC');
  }

  static getAllDetailsProcessus(id) {
    return db.execute('SELECT * FROM lst_processus_details where id_processus = ? order by id_details DESC',[id]);
  }

  static getLastIdProcessus() {
    return db.execute("SELECT MAX(id_processus) AS max FROM lst_processus  ");
  }


//procedure pour la mise a jour manuellement des monographies
  static async postMonographies(values) {
    //creation de la date
    let dt = datetime.create();
    let date = dt.format('Y-m-d H:M:S');
    //ajouter la date dans le tableau des données
    //console.log(values);
    const tabValue = [];
    let condSql = '';
    if(values[0]=='-' && values[1]=='-' && values[2]=='-'){
      return [];
    }
    tabValue['ISBN'] = values[0];
    tabValue['EISBN'] = values[1];

    if(values[0]!='-'){
      condSql += ', ISBN = ?';
      tabValue.push(values[0]);
    }
    if(values[1]!='-'){
      condSql += ', EISBN = ?';
      tabValue.push(values[1]);
    }

    // verifier les champs sur lequels on doit faire la mise a jour
    if(values[2]!='-'){
      condSql += ', titre = ?';
      tabValue.push(values[2]);
    }
    if(values[3]!='-'){
      condSql += ', fournisseur = ?';
      tabValue.push(values[3]);
    }
    if(values[4]!='-'){
      condSql += ', publicationEnPapier = ?';
      tabValue.push(values[4]);
    }
    if(values[5]!='-'){
      condSql += ', publicationEnLigne = ?';
      tabValue.push(values[5]);
    }
    if(values[6]!='-'){
      condSql += ', type = ?';
      tabValue.push(values[6]);
    }
    if(values[7]!='-'){
      condSql += ', categorie = ?';
      tabValue.push(values[7]);
    }
    if(values[8]!='-'){
      condSql += ', programme = ?';
      tabValue.push(values[8]);
    }
    if(values[9]!='-'){
      condSql += ', secteur = ?';
      tabValue.push(values[9]);
    }
    //Chercher l'id de la plateforme
    if(values[10]!='-'){
      condSql += ', fond = ?';
      tabValue.push(values[10]);
    }
    //Chercher les id des autres plateforme
    if(values[11]!='-'){
      condSql += ', noteFond = ?';
      tabValue.push(values[11]);
    }
    if(values[12]!='-'){
      condSql += ', prix = ?';
      tabValue.push(values[12]);
    }
    if(values[13]!='-'){
      condSql += ', bibliotheque = ?';
      tabValue.push(values[13]);
    }
    if(values[14]!='-'){
      condSql += ', periodeBudgetaire = ?';
      tabValue.push(values[14]);
    }
    if(values[15]!='-'){
      condSql += ', selectionDate = ?';
      tabValue.push(values[15]);
    }
    if(values[16]!='-'){
      condSql += ', auteur = ?';
      tabValue.push(values[16]);
    }
    if(values[17]!='-'){
      condSql += ', editeur = ?';
      tabValue.push(values[17]);
    }
    if(values[18]!='-'){
      condSql += ', edition = ?';
      tabValue.push(values[18]);
    }
    if(values[19]!='-'){
      condSql += ', sujet = ?';
      tabValue.push(values[19]);
    }
    if(values[20]!='-'){
      condSql += ', DOI = ?';
      tabValue.push(values[20]);
    }
    if(values[21]!='-'){
      condSql += ', nbrUsagers = ?';
      tabValue.push(values[21]);
    }
    if(values[22]!='-'){
      condSql += ', nbrExemplaire = ?';
      tabValue.push(values[22]);
    }

    // si tous les champs sont '-'
    if(condSql==''){
      return []
    }
    // supprimer ',' du debut de la condition
    condSql = condSql.slice(1);
    tabValue.push(date);

      tabValue['id']=await this.matchIdRevue(tabValue['ISBN'],tabValue['EISBN'],'','','monographie');
      //si non match ajouter une nouvelle fiche
      if(tabValue['id']=='-1'){
        tabValue.push('monographie');
        await db.execute('INSERT INTO tbl_revues SET ' + condSql + ',dateA =?,forme=?,idRevue=0', tabValue);
        let lastId= await db.execute('SELECT MAX(idRevue) as max from tbl_revues');
        tabValue['id']=lastId[0]['0']['max'];

      } else {
        tabValue.push(tabValue['id']);
        await  db.execute('UPDATE tbl_revues SET ' + condSql + ' ,dateM =? WHERE idRevue=? ', tabValue );
      }
    /** Ajout details processus*/
    await this.ajoutProcessusDetails(tabValue['id'],values[2],'monographie');
  }

  //procedure pour la mise a jour manuellement des films
  static async postFilms(values) {
    //creation de la date
    let dt = datetime.create();
    let date = dt.format('Y-m-d H:M:S');
    //ajouter la date dans le tableau des données
    //console.log(values);
    const tabValue = [];
    let condSql = '';
    if(values[0]=='-' && values[1]=='-' ){
      return [];
    }
    tabValue['kanopyID'] = values[0];
    tabValue['titre'] = values[1];

    if(values[0]!='-'){
      condSql += ', kanopyID = ?';
      tabValue.push(values[0]);
    }
    if(values[1]!='-'){
      condSql += ', titre = ?';
      tabValue.push(values[1]);
    }
    // verifier les champs sur lequels on doit faire la mise a jour
    if(values[2]!='-'){
      condSql += ', fournisseur = ?';
      tabValue.push(values[2]);
    }
    if(values[3]!='-'){
      condSql += ', debutLicence = ?';
      tabValue.push(values[3]);
    }
    if(values[4]!='-'){
      condSql += ', finLicence = ?';
      tabValue.push(values[4]);
    }
    if(values[5]!='-'){
      condSql += ', annee = ?';
      tabValue.push(values[5]);
    }
    if(values[6]!='-'){
      condSql += ', realisateur = ?';
      tabValue.push(values[6]);
    }
    if(values[7]!='-'){
      condSql += ', production = ?';
      tabValue.push(values[7]);
    }
    if(values[8]!='-'){
      condSql += ', sujet = ?';
      tabValue.push(values[8]);
    }
    if(values[9]!='-'){
      condSql += ', programme = ?';
      tabValue.push(values[9]);
    }
    //Chercher l'id de la plateforme
    if(values[10]!='-'){
      condSql += ', langue = ?';
      tabValue.push(values[10]);
    }

    // si tous les champs sont '-'
    if(condSql==''){
      return []
    }
    // supprimer ',' du debut de la condition
    condSql = condSql.slice(1);
    tabValue.push(date);

    tabValue['id']=await this.matchIdRevue('','',tabValue['kanopyID'],'','film');
    //si non match ajouter une nouvelle fiche
    if(tabValue['id']=='-1'){
      tabValue.push('film');
      await db.execute('INSERT INTO  tbl_films  SET ' + condSql + ',dateA =?,forme=?,idFilm=0', tabValue);
      let lastId= await db.execute('SELECT MAX(idFilm) as max from tbl_films');
      tabValue['id']=lastId[0]['0']['max'];

    } else {
      tabValue.push(tabValue['id']);
      await  db.execute('UPDATE  tbl_films  SET ' + condSql + ' ,dateM =? WHERE idFilm=? ', tabValue );
    }
    /** Ajout details processus*/
    await this.ajoutProcessusDetails(tabValue['id'],values[1],'film');
  }

  //procedure pour la mise a jour manuellement des films
  static async postPrets(values) {
    //creation de la date
    let dt = datetime.create();
    let date = dt.format('Y-m-d H:M:S');
    //ajouter la date dans le tableau des données
    console.log(values);
    const tabValue = [];
    let condSql = '';
    if(values[0]=='-'){
      return [];
    }
    tabValue['titre'] = values[0];

    if(values[0]!='-'){
      condSql += ', titre = ?';
      tabValue.push(values[0]);
    }
    // verifier les champs sur lequels on doit faire la mise a jour
    if(values[1]!='-'){
      condSql += ', fournisseur = ?';
      tabValue.push(values[1]);
    }
    if(values[2]!='-'){
      condSql += ', dateAcquisition = ?';
      tabValue.push(values[2]);
    }
    if(values[3]!='-'){
      condSql += ', auteur = ?';
      tabValue.push(values[3]);
    }
    if(values[4]!='-'){
      condSql += ', editeur = ?';
      tabValue.push(values[4]);
    }
    if(values[5]!='-'){
      condSql += ', format = ?';
      tabValue.push(values[5]);
    }
    if(values[6]!='-'){
      condSql += ', prix = ?';
      tabValue.push(values[6]);
    }
    if(values[7]!='-'){
      condSql += ', exemplairesActifs = ?';
      tabValue.push(values[7]);
    }

    if(values[8]!='-'){
      condSql += ', reservation = ?';
      tabValue.push(values[8]);
    }

    if(values[9]!='-'){
      condSql += ', prets = ?';
      tabValue.push(values[9]);
    }

    if(values[10]!='-'){
      condSql += ', nombrePretAutorises = ?';
      tabValue.push(values[10]);
    }

    if(values[11]!='-'){
      condSql += ', nombrePretSimulAutorises = ?';
      tabValue.push(values[11]);
    }

    if(values[12]!='-'){
      condSql += ', dateExpiration = ?';
      tabValue.push(values[12]);
    }

    if(values[13]!='-'){
      condSql += ', dateEpuisement = ?';
      tabValue.push(values[13]);
    }

    // si tous les champs sont '-'
    if(condSql==''){
      return []
    }
    // supprimer ',' du debut de la condition
    condSql = condSql.slice(1);
    tabValue.push(date);

    tabValue['id']=await this.matchIdRevue('','','',tabValue['titre'],'pret');
    //si non match ajouter une nouvelle fiche
    if(tabValue['id']=='-1'){
      tabValue.push('pret');
      await db.execute('INSERT INTO  tbl_prets  SET ' + condSql + ',dateA =?,forme=?,idPret=0', tabValue);
      let lastId= await db.execute('SELECT MAX(idPret) as max from tbl_prets');
      tabValue['id']=lastId[0]['0']['max'];

    } else {
      tabValue.push(tabValue['id']);
      await  db.execute('UPDATE  tbl_prets  SET ' + condSql + ' ,dateM =? WHERE idPret=? ', tabValue );
    }
    /** Ajout details processus*/
    await this.ajoutProcessusDetails(tabValue['id'],values[0],'pret');
  }


  static delete(id) {
    return db.execute('DELETE FROM lst_processus WHERE id_processus  = ?', [id]);
  }

  static deleteProcessusDetails(id) {

    return db.execute('DELETE FROM lst_processus_details WHERE id_details  = ?', [id]);
  }


  static async ajoutProcessus(values) {
    let dt = datetime.create();
    let date = dt.format('d/m/Y H:M:S');
    let statut = 'Terminé';
    values.push(date);
    /*let sql1= 'INSERT INTO lst_processus SET titre =?,statut =?,admin =?,h_debut =?,h_fin =?';
    console.log('sql1: ', SqlString.format(sql1,[values[0],statut,values[1],values[2],date]));*/
    return db.execute('INSERT INTO lst_processus SET titre =?,type =?,statut =?,admin =?,note =?,h_debut =?,h_fin =? ', [values[0],values[1],statut,values[2],values[3],values[4],date] );
  }

  static async ajoutProcessusDetails(id,titre,forme) {
    let dt = datetime.create();
    let values=[];
    values.push((id));
    values.push((titre));
    values.push((forme));
    let date = dt.format('y-m-d H:M:S');
    let lastId= await db.execute('SELECT MAX(id_processus) as id_processus FROM lst_processus');
    let idPr=lastId[0]['0']['id_processus']+1;
    values.push(idPr);
    values.push(date);
    //console.log(values);
    /*let sql1= 'INSERT INTO lst_processus_details SET id =?,titre =?, forme =?,id_processus=?,dateA =?';
    console.log('sql1: ', SqlString.format(sql1,values));*/
    return db.execute('INSERT INTO lst_processus_details SET id =?,titre =?, forme =?,id_processus=?,dateA =?', values );
  }

  static async matchIdRevue(isbn,eisbn,kanopyID,titre,forme){
    let valIdMatch=[];
    let sqlMatch='';
    let table='';
    let id=-1;
    switch (forme){
      case 'monographie':
        table='tbl_revues';
        if(isbn=='-' && eisbn!='-'){
          sqlMatch=' ISBN  =?  OR    EISBN =? ';
          valIdMatch.push(eisbn)
          valIdMatch.push(eisbn)
        }
        if(isbn!='-' && eisbn=='-'){
          sqlMatch=' ISBN =?  OR   EISBN=? ';
          valIdMatch.push(isbn)
          valIdMatch.push(eisbn)
        }
        if(isbn!='-' && eisbn!='-'){
          sqlMatch=' ( ISBN =? AND  EISBN=? ) OR  ( ISBN =? AND  EISBN=? )';
          valIdMatch.push(isbn)
          valIdMatch.push(eisbn)
          valIdMatch.push(eisbn)
          valIdMatch.push(isbn)
        }

        /*let sql1= "SELECT idRevue as id  FROM  " +table+"  WHERE  " +sqlMatch+"  LIMIT 0,1";
        console.log('sql1: ', SqlString.format(sql1,valIdMatch));*/
        let idSQL= await db.execute("SELECT idRevue as id,titre  FROM  " +table+"  WHERE  " +sqlMatch+"  LIMIT 0,1",valIdMatch);
        if(idSQL){
          if (idSQL[0].length>0)
              id=idSQL[0]['0']['id'];
        }
        break;
      case 'film':
        table='tbl_films';
        if(kanopyID!='-' ){
          sqlMatch='  kanopyID =? ';
          valIdMatch.push(kanopyID)
        }

        let idSQLFilm= await db.execute("SELECT idFilm as id,titre  FROM  " +table+"  WHERE  " +sqlMatch+"  LIMIT 0,1",valIdMatch);
        if(idSQLFilm){
          if (idSQLFilm[0].length>0)
            id=idSQLFilm[0]['0']['id'];
        }
        break;
      case 'pret':
        table='tbl_prets';
        if(titre!='-' ){
          sqlMatch='  titre  like ? ';
          valIdMatch.push(titre)
        }

        let idSQLPret= await db.execute("SELECT idPret as id,titre  FROM  " +table+"  WHERE  " +sqlMatch+"  LIMIT 0,1",valIdMatch);
        if(idSQLPret){
          if (idSQLPret[0].length>0)
            id=idSQLPret[0]['0']['id'];
        }
        break;
    }
    return id;
  }


};

