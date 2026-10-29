import '../화면/글꼴.css';
import './월간리포트.css';
import { renderMonthlySample } from '../화면/월간리포트.js';
import { monthlySample, reviewedObservation } from './월간샘플.js';

document.querySelector('#monthly-report').innerHTML = renderMonthlySample(monthlySample, reviewedObservation);

const section = document.getElementById(location.hash.slice(1));
if (section) {
  document.fonts.ready.then(() => section.scrollIntoView({ behavior: 'instant', block: 'start' }));
}
