import {
  GraphDbClient,
  GraphDbDistributionList,
  ImportStatusList,
} from './graphdb';
import {Distribution} from './distribution';

const DRclient = new GraphDbClient(
  'https://triplestore.netwerkdigitaalerfgoed.nl',
  'registry'
);

const KGclient = new GraphDbClient('http://localhost:7200', 'kg-temp');

function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function checkImportStatus(distribution: string, statusList: ImportStatusList) {
  // return import status for the current distribution
  for (const statusRecord of statusList) {
    if (statusRecord.name === distribution) {
      return statusRecord.status;
    }
  }
  // return 'NOT FOUND' error is distribution not in the statuslist
  return 'NOT FOUND';
}

async function importDistribution(distribution: Distribution) {
  const dataset_url = distribution.data_url.href;
  const distribution_url = distribution.dist_url.href;

  //console.log(n, distribution.data_url.href, distribution.dist_url.href);
  // import distribution by url
  const importAction = await KGclient.import(dataset_url, distribution_url);
  if (!importAction || importAction.status !== 202) {
    console.log('Error accessing dataset, skipped: ' + dataset_url);
    return 'ERROR';
  }

  // wait for import process to finish
  let finished = false;
  let importStatus = '';
  let numberOfTries = 0;
  while (!finished) {

    // import proces is probably running, wait a while
    await sleep(3000);

    // get status update, this returns a list of recent imports
    const statusList = await KGclient.importStatus();

    // check status for the current distribution
    importStatus = checkImportStatus(distribution_url, statusList);

    // determine if we reached an end status
    switch (importStatus) {
      case 'DONE':
        finished = true;
        break;
      case 'ERROR':
        console.log('Error importing ' + distribution_url + '(import error)');
        finished = true;
        break;
      case 'NOT FOUND':
        console.log('Error importing ' + distribution_url + '(not found)');
        finished = true;
    }
/*
    // importing the data can take a long time
    if( importStatus === 'IMPORTING' ) {
      // keep track of the number of sleeps
      numberOfTries++;
      if ( numberOfTries > 500 ) {
         console.log('Error importing ' + distribution_url + '(time out)')
         importStatus = 'TIME OUT';
         finished = true;
      }
    }
*/
  }
  return importStatus;
}

(async () => {
  const dist = new GraphDbDistributionList(DRclient);
  const distributions = await dist.getDistributionList();
  console.log('Total number of distribution files to process:', distributions.length);
  let n = 0;
  let max = 3;
  for (const distribution of distributions) {
    const dist = distribution.dist_url.href;
    const dataset = distribution.data_url.href;

    const response = await KGclient.checkDistUrl(dist)
    if (response.status !== 200 ) {
      console.log('Error: distribution url unreachable',dist);
      continue
    }

    n++;

/*
    if( n > max ) {
      if( n === (max+1) ) {
        console.log('Reached maximum number to processed, skipping the rest');
      }
      continue;
    }
*/

    console.log('Starting with',n, dist);

    // skip this distribution if import wasn't succesful
    const importStatus = await importDistribution(distribution)

    let queryfile = 'clear-graph.rq';
    if( !await KGclient.analyseQuery(queryfile, dist, dataset, false, importStatus)){
      console.log('Error processing ' + queryfile );
    }

    if ( importStatus !== 'DONE') {
      continue;
    }

    queryfile = 'analyse-classes.rq';
    if( !await KGclient.analyseQuery(queryfile, dist, dataset, true)){
      console.log('Error processing ' + queryfile );
    }

    queryfile = 'analyse-properties.rq';
    if( !await KGclient.analyseQuery(queryfile, dist, dataset, true)){
      console.log('Error processing ' + queryfile );
    }

    //await sleep(3000);
    // remove the orginal graph
    const deleteAction = await KGclient.removeNamedGraph(dist);
    //console.log(deleteAction);
    if (!deleteAction || deleteAction.status !== 204) {
      console.log('Error: problems deleting dataset, skipped: ' + dist);
    }
  }
})();
