import { mountGarage } from "../preview/LiveGarage";

const host = document.querySelector<HTMLElement>("[data-live-garage]");
if (host) mountGarage(host);
