-- Tiliote-PDF (pankkituonti): yksi storage-polku, viittaus toistuu useilla tositteilla.
alter table public.ppr_paivakirja
  add column if not exists tosite_tiliote_pdf_path text;

comment on column public.ppr_paivakirja.tosite_tiliote_pdf_path is
  'Liitteenä näytettävä tiliote-PDF (storage path). Sama polku voi esiintyä monella BA-tositeella samasta tuonnista.';
