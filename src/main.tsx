import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./app/router";
import { WalletProvider } from "./wallet/WalletProvider";
import { PageDataProvider } from "./seo/PageData";
import type { PageSnapshot } from "./seo/page";
import "./styles.css";

const root = document.getElementById("root")!;
const dataElement = document.getElementById("page-data");
let snapshot: PageSnapshot | undefined;
if (dataElement?.textContent) snapshot = JSON.parse(dataElement.textContent) as PageSnapshot;
const app = (
  <React.StrictMode>
    <PageDataProvider snapshot={snapshot}>
      <WalletProvider><BrowserRouter><AppRouter /></BrowserRouter></WalletProvider>
    </PageDataProvider>
  </React.StrictMode>
);
if (snapshot) ReactDOM.hydrateRoot(root, app);
else ReactDOM.createRoot(root).render(app);
