import { Injectable } from "@nestjs/common";
import { languages } from "@reactive-resume/utils";

@Injectable()
export class TranslationService {
  fetchLanguages() {
    // 本地模式直接返回默认语言列表
    return languages;
  }
}
