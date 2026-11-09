import english from '../catalogue/en/legal.json'
import malay from '../catalogue/ms/legal.json'
import { catalogueFiles } from './catalogue'

// Register only when the public or legal feature loads, keeping long-form legal copy out of the landing bundle.
catalogueFiles['../catalogue/en/legal.json'] = { default: english }
catalogueFiles['../catalogue/ms/legal.json'] = { default: malay }
